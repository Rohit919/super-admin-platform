import { AppError } from "./app-error.js";
import { ErrorCode } from "./error-codes.js";

export class RateLimitError extends AppError {
  /** Seconds until the client may retry — surfaced as a Retry-After header. */
  public readonly retryAfter?: number;

  constructor(message: string = "Too many requests", retryAfter?: number) {
    super(message, 429, true, undefined, ErrorCode.RATE_LIMITED);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}
