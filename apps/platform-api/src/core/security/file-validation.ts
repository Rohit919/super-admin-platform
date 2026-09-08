/**
 * File upload content validation (SECURITY.md §24).
 *
 * The client-provided Content-Type, filename, and extension are all untrusted.
 * We sniff the actual leading bytes ("magic numbers") to determine the real
 * type, enforce a type allowlist, cap size, and reject polyglot files — inputs
 * that are simultaneously valid as two formats (e.g. a GIF that is also valid
 * HTML/JS, or a ZIP concatenated onto an image) and are used to smuggle
 * executable/scriptable content past naive filters.
 */
import { AppError } from "@core/errors/app-error.js";
import { ErrorCode } from "@core/errors/error-codes.js";

/** Thrown when uploaded content fails validation. */
export class UnsafeFileError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, true, details, ErrorCode.UNSAFE_FILE);
    this.name = "UnsafeFileError";
  }
}

export interface DetectedType {
  /** Canonical mime type derived from magic bytes. */
  mime: string;
  /** Canonical extension (no dot). */
  ext: string;
}

interface Signature extends DetectedType {
  /** Byte pattern; `null` entries are wildcards. */
  bytes: (number | null)[];
  offset?: number;
}

// Minimal, high-confidence signature table. Extend per product needs.
const SIGNATURES: Signature[] = [
  {
    mime: "image/png",
    ext: "png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", ext: "gif", bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { mime: "image/webp", ext: "webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (further checked below)
  {
    mime: "application/pdf",
    ext: "pdf",
    bytes: [0x25, 0x50, 0x44, 0x46, 0x2d],
  }, // %PDF-
  { mime: "application/zip", ext: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
];

function matches(buf: Buffer, sig: Signature): boolean {
  const offset = sig.offset ?? 0;
  if (buf.length < offset + sig.bytes.length) return false;
  return sig.bytes.every((b, i) => b === null || buf[offset + i] === b);
}

/** Detect the real type from leading bytes, or null if unrecognized. */
export function detectType(buf: Buffer): DetectedType | null {
  for (const sig of SIGNATURES) {
    if (matches(buf, sig)) {
      // WEBP: RIFF container must declare "WEBP" at offset 8.
      if (sig.ext === "webp" && buf.toString("ascii", 8, 12) !== "WEBP")
        continue;
      return { mime: sig.mime, ext: sig.ext };
    }
  }
  return null;
}

// Signatures of executable/scriptable content that must never appear at the
// start of an upload we treat as data (defence against polyglots/webshells).
const DANGEROUS_LEADS: { label: string; test: (buf: Buffer) => boolean }[] = [
  {
    label: "html",
    test: (b) =>
      /^\s*<(!doctype|html|script|svg|\?xml)/i.test(b.toString("utf8", 0, 64)),
  },
  {
    label: "php",
    test: (b) =>
      b.toString("utf8", 0, 64).includes("<?php") ||
      b.toString("utf8", 0, 8).includes("<?="),
  },
  { label: "script-shebang", test: (b) => b.toString("utf8", 0, 2) === "#!" },
  {
    label: "elf",
    test: (b) =>
      b.length >= 4 &&
      b[0] === 0x7f &&
      b[1] === 0x45 &&
      b[2] === 0x4c &&
      b[3] === 0x46,
  },
  {
    label: "ms-exe",
    test: (b) => b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a,
  }, // "MZ"
];

export interface FileValidationOptions {
  /** Allowed canonical mime types (from magic bytes, not the client). */
  allowedMimeTypes: string[];
  /** Max size in bytes. */
  maxBytes: number;
  /** Client-declared content type — compared against the sniffed type. */
  declaredMimeType?: string;
}

export interface ValidatedFile {
  mime: string;
  ext: string;
  size: number;
}

/**
 * Validate uploaded bytes. Throws {@link UnsafeFileError} on any failure.
 *
 * Checks, in order: non-empty, size cap, dangerous/scriptable lead bytes
 * (polyglot defence), recognizable magic type, type allowlist, and — when a
 * client type is declared — agreement between declared and sniffed types.
 */
export function validateFileContent(
  buf: Buffer,
  options: FileValidationOptions,
): ValidatedFile {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    throw new UnsafeFileError("Empty file.");
  }
  if (buf.length > options.maxBytes) {
    throw new UnsafeFileError(
      `File exceeds maximum size of ${options.maxBytes} bytes.`,
    );
  }

  for (const lead of DANGEROUS_LEADS) {
    if (lead.test(buf)) {
      throw new UnsafeFileError(
        "File contains disallowed executable or scriptable content.",
      );
    }
  }

  const detected = detectType(buf);
  if (!detected) {
    throw new UnsafeFileError(
      "File type could not be verified from its contents.",
    );
  }
  if (!options.allowedMimeTypes.includes(detected.mime)) {
    throw new UnsafeFileError(`File type "${detected.mime}" is not allowed.`);
  }

  // Client-declared type must agree with the real (sniffed) type — a mismatch
  // is a strong signal of a disguised/polyglot upload.
  if (
    options.declaredMimeType &&
    options.declaredMimeType.toLowerCase() !== detected.mime
  ) {
    throw new UnsafeFileError(
      "Declared content type does not match file contents.",
    );
  }

  return { mime: detected.mime, ext: detected.ext, size: buf.length };
}
