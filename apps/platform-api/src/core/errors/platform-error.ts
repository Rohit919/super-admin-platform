import { AppError } from "./app-error.js";
import { ErrorCode } from "./error-codes.js";

/**
 * Platform-boundary error (Super Admin layer).
 *
 * Raised when a caller lacks ACTIVE platform membership OR the platform
 * permission required for the operation. Reported identically (403) whether the
 * user has no platform membership, an inactive one, or is missing the
 * permission — a tenant user must not be able to probe platform structure
 * (MULTI-TENANT-ARCHITECTURE §57, §58, §83).
 */
export class PlatformAccessDeniedError extends AppError {
  constructor(message: string = "Platform access denied.") {
    super(message, 403, true, undefined, ErrorCode.PLATFORM_ACCESS_DENIED);
    this.name = "PlatformAccessDeniedError";
  }
}
