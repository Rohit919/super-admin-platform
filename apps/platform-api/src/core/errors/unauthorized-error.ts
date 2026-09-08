import { AppError } from "./app-error.js";
import { ErrorCode } from "./error-codes.js";

export class UnauthorizedError extends AppError {
  constructor(
    message: string = "Unauthorized",
    code: string = ErrorCode.UNAUTHORIZED,
  ) {
    super(message, 401, true, undefined, code);
    this.name = "UnauthorizedError";
  }
}
