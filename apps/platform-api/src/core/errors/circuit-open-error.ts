import { AppError } from "./app-error.js";
import { ErrorCode } from "./error-codes.js";

/**
 * Thrown when a circuit breaker is OPEN — the wrapped call fails fast without
 * attempting the (likely-failing) downstream request. 503 = temporary.
 */
export class CircuitOpenError extends AppError {
  constructor(service: string) {
    super(
      `Circuit open for "${service}" — downstream temporarily unavailable`,
      503,
      true,
      undefined,
      ErrorCode.SERVICE_UNAVAILABLE,
    );
    this.name = "CircuitOpenError";
  }
}
