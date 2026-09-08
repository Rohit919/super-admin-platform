/**
 * Security utilities barrel (SECURITY.md defense-in-depth).
 * Import from '@core/security'.
 *
 *   §53 SSRF        → assertSafeUrl / isSafeUrl / isPrivateIp
 *   §23 traversal   → resolveWithinBase / isWithinBase / safeFilename
 *   §24 file upload → validateFileContent / detectType
 */
export {
  assertSafeUrl,
  isSafeUrl,
  isPrivateIp,
  SsrfError,
  type SsrfCheckOptions,
} from "./ssrf.js";

export {
  resolveWithinBase,
  isWithinBase,
  safeFilename,
  PathTraversalError,
} from "./paths.js";

export {
  validateFileContent,
  detectType,
  UnsafeFileError,
  type FileValidationOptions,
  type ValidatedFile,
  type DetectedType,
} from "./file-validation.js";
