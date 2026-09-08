/**
 * Path-traversal protection (SECURITY.md §23).
 *
 * User input must never directly determine a filesystem path. These helpers
 * resolve a caller-supplied name/segment against an allowlisted base directory
 * and guarantee the result stays inside it — defeating `../../etc/passwd`,
 * absolute-path injection, and encoded traversal.
 *
 * Prefer opaque IDs + generated filenames over echoing client filenames
 * (SECURITY.md §23/§24): use {@link safeFilename} for anything persisted.
 */
import { resolve, sep, basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "@core/errors/app-error.js";
import { ErrorCode } from "@core/errors/error-codes.js";

/** Thrown when a resolved path escapes its allowed base directory. */
export class PathTraversalError extends AppError {
  constructor(message = "Invalid path.") {
    super(message, 400, true, undefined, ErrorCode.PATH_TRAVERSAL_BLOCKED);
    this.name = "PathTraversalError";
  }
}

// Reject NUL bytes (poison-null-byte) and control characters outright.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f]/;

/**
 * Resolve `userSegment` inside `baseDir` and confirm the result never escapes
 * `baseDir`. Throws {@link PathTraversalError} on any traversal attempt.
 *
 *   const p = resolveWithinBase('/srv/uploads', req.params.file);
 */
export function resolveWithinBase(
  baseDir: string,
  userSegment: string,
): string {
  if (typeof userSegment !== "string" || userSegment.length === 0) {
    throw new PathTraversalError();
  }
  if (CONTROL_CHARS.test(userSegment)) {
    throw new PathTraversalError();
  }

  const base = resolve(baseDir);
  const candidate = resolve(base, userSegment);

  // Must be the base itself or a descendant. The `sep` suffix stops
  // sibling-prefix escapes like `/srv/uploads-evil` matching `/srv/uploads`.
  if (candidate !== base && !candidate.startsWith(base + sep)) {
    throw new PathTraversalError();
  }
  return candidate;
}

/** True if `userSegment` resolves safely inside `baseDir` (non-throwing). */
export function isWithinBase(baseDir: string, userSegment: string): boolean {
  try {
    resolveWithinBase(baseDir, userSegment);
    return true;
  } catch {
    return false;
  }
}

/**
 * Produce an opaque, collision-resistant filename that preserves only a
 * sanitized extension from the client's filename. The client-provided name is
 * never trusted for the stored path (SECURITY.md §24).
 *
 *   safeFilename('../../evil.php')      → 'a1b2...-uuid.php'  (ext kept, name dropped)
 *   safeFilename('report.PDF', ['pdf']) → 'a1b2...-uuid.pdf'
 *
 * @param originalName client-supplied filename (untrusted)
 * @param allowedExtensions optional lowercase extensions without the dot; if
 *        set and the original extension is not listed, the extension is dropped.
 */
export function safeFilename(
  originalName: string,
  allowedExtensions?: string[],
): string {
  const id = randomUUID();
  const raw = extname(basename(originalName || ""))
    .replace(/^\./, "")
    .toLowerCase();
  // Only permit a conservative, single, alphanumeric extension.
  const ext = /^[a-z0-9]{1,12}$/.test(raw) ? raw : "";
  if (!ext) return id;
  if (
    allowedExtensions &&
    !allowedExtensions.map((e) => e.toLowerCase()).includes(ext)
  ) {
    return id;
  }
  return `${id}.${ext}`;
}
