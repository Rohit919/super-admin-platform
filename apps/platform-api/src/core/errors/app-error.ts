import { ErrorCode } from "./error-codes.js";

/**
 * Base application error. All domain errors extend this.
 * `isOperational` distinguishes expected errors (validation, auth) from
 * unexpected programming errors — the global handler logs them differently.
 *
 * `code` is a STABLE, machine-readable identifier that clients branch on
 * (never the message — see API_CONVENTIONS §39). Subclasses set a sensible
 * default; feature-specific codes can be passed explicitly.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;
  public readonly code: string;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: unknown,
    code: string = ErrorCode.INTERNAL_ERROR,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}
