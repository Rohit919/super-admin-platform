import { AppError } from "./app-error.js";
import { ErrorCode } from "./error-codes.js";

export class ConflictError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    code: string = ErrorCode.CONFLICT,
  ) {
    super(message, 409, true, details, code);
    this.name = "ConflictError";
  }
}
