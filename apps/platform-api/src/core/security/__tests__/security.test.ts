import { describe, it, expect } from "vitest";
import {
  assertSafeUrl,
  isPrivateIp,
  SsrfError,
  resolveWithinBase,
  isWithinBase,
  safeFilename,
  PathTraversalError,
  validateFileContent,
  detectType,
  UnsafeFileError,
} from "../index.js";

// ── SSRF (SECURITY.md §53) ────────────────────────────────────────────────────
describe("SSRF: isPrivateIp", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata / link-local
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd00::1",
  ])("flags %s as private/non-public", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34"])("allows public %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe("SSRF: assertSafeUrl", () => {
  it("rejects non-allowlisted protocols", async () => {
    await expect(assertSafeUrl("ftp://example.com")).rejects.toBeInstanceOf(
      SsrfError,
    );
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toBeInstanceOf(
      SsrfError,
    );
  });

  it("rejects http by default (https-only)", async () => {
    await expect(assertSafeUrl("http://example.com")).rejects.toBeInstanceOf(
      SsrfError,
    );
  });

  it("rejects embedded credentials", async () => {
    await expect(
      assertSafeUrl("https://user:pass@example.com", { resolveDns: false }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects private literal IPs and metadata endpoints", async () => {
    await expect(assertSafeUrl("https://127.0.0.1")).rejects.toBeInstanceOf(
      SsrfError,
    );
    await expect(
      assertSafeUrl("https://169.254.169.254/latest/meta-data"),
    ).rejects.toBeInstanceOf(SsrfError);
    await expect(
      assertSafeUrl("https://metadata.google.internal"),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects localhost/internal hostnames", async () => {
    await expect(assertSafeUrl("https://localhost")).rejects.toBeInstanceOf(
      SsrfError,
    );
    await expect(assertSafeUrl("https://db.internal")).rejects.toBeInstanceOf(
      SsrfError,
    );
  });

  it("enforces the host allowlist when provided", async () => {
    await expect(
      assertSafeUrl("https://evil.com", {
        allowedHosts: [".example.com"],
        resolveDns: false,
      }),
    ).rejects.toBeInstanceOf(SsrfError);
    await expect(
      assertSafeUrl("https://api.example.com", {
        allowedHosts: [".example.com"],
        resolveDns: false,
      }),
    ).resolves.toBeInstanceOf(URL);
  });
});

// ── Path traversal (SECURITY.md §23) ──────────────────────────────────────────
describe("Path traversal: resolveWithinBase", () => {
  const base = "/srv/uploads";

  it("resolves a normal segment inside base", () => {
    expect(resolveWithinBase(base, "a/b.txt")).toBe("/srv/uploads/a/b.txt");
  });

  it.each(["../../etc/passwd", "../secret", "/etc/passwd", "a/../../b", ".."])(
    "rejects traversal segment %s",
    (seg) => {
      expect(() => resolveWithinBase(base, seg)).toThrow(PathTraversalError);
    },
  );

  it("rejects NUL byte injection", () => {
    expect(() => resolveWithinBase(base, "file\u0000.txt")).toThrow(
      PathTraversalError,
    );
  });

  it("rejects sibling-prefix escape", () => {
    expect(isWithinBase(base, "../uploads-evil/x")).toBe(false);
  });
});

describe("Path traversal: safeFilename", () => {
  it("drops the client name and keeps a safe extension", () => {
    const name = safeFilename("../../evil.png");
    expect(name).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  it("drops disallowed extensions", () => {
    const name = safeFilename("shell.php", ["png", "jpg"]);
    expect(name).toMatch(/^[0-9a-f-]{36}$/); // no extension
  });

  it("drops double/script extensions", () => {
    const name = safeFilename("image.php.png"); // extname => .png, safe
    expect(name).toMatch(/^[0-9a-f-]{36}\.png$/);
  });
});

// ── File content validation (SECURITY.md §24) ─────────────────────────────────
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const HTML_POLYGLOT = Buffer.from("GIF89a<script>alert(1)</script>", "utf8");
const PHP = Buffer.from("<?php system($_GET[0]); ?>", "utf8");

describe("File validation: detectType", () => {
  it("detects real png/jpeg from magic bytes", () => {
    expect(detectType(PNG)?.mime).toBe("image/png");
    expect(detectType(JPG)?.mime).toBe("image/jpeg");
  });
});

describe("File validation: validateFileContent", () => {
  const opts = {
    allowedMimeTypes: ["image/png", "image/jpeg"],
    maxBytes: 1024,
  };

  it("accepts an allowed image", () => {
    expect(validateFileContent(PNG, opts)).toMatchObject({
      mime: "image/png",
      ext: "png",
    });
  });

  it("rejects empty files", () => {
    expect(() => validateFileContent(Buffer.alloc(0), opts)).toThrow(
      UnsafeFileError,
    );
  });

  it("rejects files over the size cap", () => {
    expect(() => validateFileContent(PNG, { ...opts, maxBytes: 4 })).toThrow(
      UnsafeFileError,
    );
  });

  it("rejects scriptable/polyglot content", () => {
    expect(() => validateFileContent(HTML_POLYGLOT, opts)).toThrow(
      UnsafeFileError,
    );
    expect(() => validateFileContent(PHP, opts)).toThrow(UnsafeFileError);
  });

  it("rejects a type not on the allowlist", () => {
    expect(() =>
      validateFileContent(PNG, {
        ...opts,
        allowedMimeTypes: ["application/pdf"],
      }),
    ).toThrow(UnsafeFileError);
  });

  it("rejects when declared type disagrees with sniffed type", () => {
    expect(() =>
      validateFileContent(PNG, { ...opts, declaredMimeType: "image/jpeg" }),
    ).toThrow(UnsafeFileError);
  });
});
