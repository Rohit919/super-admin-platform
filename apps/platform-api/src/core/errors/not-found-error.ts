import { AppError } from "./app-error.js";
import { ErrorCode } from "./error-codes.js";

export class NotFoundError extends AppError {
  constructor(
    message: string = "Resource not found",
    code: string = ErrorCode.NOT_FOUND,
  ) {
    super(message, 404, true, undefined, code);
    this.name = "NotFoundError";
  }
}
