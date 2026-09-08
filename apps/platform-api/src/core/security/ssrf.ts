/**
 * SSRF protection (SECURITY.md §53).
 *
 * The API must never `fetch(userProvidedUrl)` blindly. User-supplied URLs are
 * validated here BEFORE any outbound request so an attacker cannot pivot the
 * server into internal services, cloud metadata endpoints, or link-local
 * addresses.
 *
 * Layered checks (default-deny):
 *   1. Parseable URL.
 *   2. Protocol on an explicit allowlist (https by default; http opt-in).
 *   3. No embedded credentials (user:pass@host).
 *   4. Host is not a blocked literal IP (loopback / private / link-local /
 *      unique-local / cloud metadata) and, when a hostname is given, its
 *      resolved addresses are all public.
 *   5. Optional host allowlist for "known integrations only" deployments.
 *
 * DNS is resolved and every returned address is checked to defeat DNS
 * rebinding at validation time. Callers that then fetch should also pin/limit
 * redirects and set timeouts (see core/circuit-breaker.ts).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@core/errors/app-error.js";
import { ErrorCode } from "@core/errors/error-codes.js";

/** Thrown when a URL fails SSRF validation. 400 — the request is malformed/unsafe. */
export class SsrfError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, true, details, ErrorCode.SSRF_BLOCKED);
    this.name = "SsrfError";
  }
}

export interface SsrfCheckOptions {
  /** Allowed URL protocols. Default: ['https:'] (add 'http:' only for trusted/dev use). */
  allowedProtocols?: string[];
  /**
   * Optional allowlist of permitted hostnames (exact, case-insensitive) or
   * parent domains (a leading '.' matches subdomains, e.g. '.example.com').
   * When set, anything not listed is rejected — the strongest posture.
   */
  allowedHosts?: string[];
  /** Resolve DNS and verify every address is public. Default: true. */
  resolveDns?: boolean;
}

const DEFAULT_PROTOCOLS = ["https:"];

/**
 * Cloud metadata / instance identity endpoints. These are the classic SSRF
 * targets for credential theft (AWS/GCP/Azure/Alibaba/DigitalOcean).
 */
const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
]);

const BLOCKED_IPS = new Set([
  "169.254.169.254", // AWS/GCP/Azure/OpenStack IMDS
  "fd00:ec2::254", // AWS IMDSv2 over IPv6
  "100.100.100.200", // Alibaba Cloud metadata
]);

/**
 * Normalize an IPv6 address to lowercase and expand the leading zero-group so
 * prefix checks are reliable. We only need coarse matching, not full RFC 5952.
 */
function normalizeIpv6(ip: string): string {
  return ip.toLowerCase().replace(/^::ffff:/, ""); // unwrap IPv4-mapped IPv6
}

/** True when the literal IP address is not routable on the public internet. */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 0) return false; // not an IP literal — caller resolves DNS

  if (BLOCKED_IPS.has(ip.toLowerCase())) return true;

  if (kind === 4) {
    const parts = ip.split(".").map((p) => Number(p));
    if (
      parts.length !== 4 ||
      parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)
    ) {
      return true; // malformed → treat as unsafe
    }
    const [a, b] = parts as [number, number, number, number];
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 192 && b === 0) return true; // 192.0.0.0/24, 192.0.2.0/24 (test/special)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
    return false;
  }

  // IPv6
  const v6 = normalizeIpv6(ip);
  // If unwrapping produced an IPv4 literal, re-check as v4.
  if (isIP(v6) === 4) return isPrivateIp(v6);
  if (v6 === "::1" || v6 === "::") return true; // loopback / unspecified
  if (v6.startsWith("fe80")) return true; // link-local
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // fc00::/7 unique-local
  if (v6.startsWith("ff")) return true; // multicast
  return false;
}

function hostAllowed(hostname: string, allowedHosts: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((entry) => {
    const e = entry.toLowerCase();
    if (e.startsWith(".")) return host === e.slice(1) || host.endsWith(e);
    return host === e;
  });
}

/**
 * Validate a user-supplied URL for outbound fetching. Returns the parsed URL on
 * success; throws {@link SsrfError} otherwise. Always `await` this before fetch.
 */
export async function assertSafeUrl(
  rawUrl: string,
  options: SsrfCheckOptions = {},
): Promise<URL> {
  const allowedProtocols = options.allowedProtocols ?? DEFAULT_PROTOCOLS;
  const resolveDns = options.resolveDns ?? true;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid URL.");
  }

  if (!allowedProtocols.includes(url.protocol)) {
    throw new SsrfError(`URL protocol "${url.protocol}" is not allowed.`);
  }

  // Embedded credentials are a common SSRF/obfuscation vector.
  if (url.username || url.password) {
    throw new SsrfError("URLs with embedded credentials are not allowed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfError("URL host is not allowed.");
  }

  if (options.allowedHosts && !hostAllowed(hostname, options.allowedHosts)) {
    throw new SsrfError("URL host is not on the allowlist.");
  }

  // Literal IP in the URL — check directly, no DNS needed.
  if (isIP(hostname) !== 0) {
    if (isPrivateIp(hostname)) {
      throw new SsrfError("URL resolves to a non-public address.");
    }
    return url;
  }

  // Reject obviously unqualified/internal hostnames (e.g. "localhost", "db").
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    throw new SsrfError("URL resolves to a non-public address.");
  }

  if (resolveDns) {
    let addresses: { address: string }[];
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new SsrfError("URL host could not be resolved.");
    }
    if (addresses.length === 0) {
      throw new SsrfError("URL host could not be resolved.");
    }
    for (const { address } of addresses) {
      if (isPrivateIp(address)) {
        throw new SsrfError("URL resolves to a non-public address.");
      }
    }
  }

  return url;
}

/** Non-throwing variant — returns true if the URL passes SSRF validation. */
export async function isSafeUrl(
  rawUrl: string,
  options?: SsrfCheckOptions,
): Promise<boolean> {
  try {
    await assertSafeUrl(rawUrl, options);
    return true;
  } catch {
    return false;
  }
}
