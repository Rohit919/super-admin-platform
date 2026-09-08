import { AppError } from "./app-error.js";
import { ErrorCode } from "./error-codes.js";

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403, true, undefined, ErrorCode.FORBIDDEN);
    this.name = "ForbiddenError";
  }
}
