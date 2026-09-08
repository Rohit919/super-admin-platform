import { AppError } from "./app-error.js";
import { ErrorCode } from "./error-codes.js";

export class ValidationError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    code: string = ErrorCode.VALIDATION_ERROR,
  ) {
    super(message, 400, true, details, code);
    this.name = "ValidationError";
  }
}
