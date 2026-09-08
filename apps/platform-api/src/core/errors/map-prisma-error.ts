import { Prisma } from "@prisma/client";
import { AppError } from "./app-error.js";
import { ConflictError } from "./conflict-error.js";
import { NotFoundError } from "./not-found-error.js";
import { ErrorCode } from "./error-codes.js";

/**
 * Translates a Prisma exception into a safe domain error at the persistence
 * boundary (ERROR_HANDLING §18 "Prisma Error Translation").
 *
 * The rest of the application must never see a raw Prisma error — doing so
 * would leak SQL, constraint names, and schema details to clients and would
 * bypass the stable error-code contract.
 *
 * Usage — wrap repository operations:
 *
 *   try {
 *     return await this.prisma.user.create({ data });
 *   } catch (err) {
 *     throw mapPrismaError(err, { resource: 'User' });
 *   }
 *
 * If the error is already an AppError it is returned unchanged, so callers can
 * wrap broadly without double-mapping.
 */
export function mapPrismaError(
  error: unknown,
  opts: { resource?: string } = {},
): AppError | unknown {
  const resource = opts.resource ?? "Resource";

  // Already a domain error — leave it alone.
  if (error instanceof AppError) return error;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      // Unique constraint violation → 409 Conflict.
      case "P2002": {
        const target = error.meta?.target;
        const fields = Array.isArray(target)
          ? target
          : target
            ? [String(target)]
            : [];
        const details = fields.length ? { fields } : undefined;
        return new ConflictError(
          `${resource} already exists`,
          details,
          ErrorCode.CONFLICT,
        );
      }
      // Record required for the operation was not found → 404.
      // (e.g. update/delete on a non-existent row)
      case "P2025":
        return new NotFoundError(`${resource} not found`);
      // Foreign key / required-relation violation → 409 Conflict.
      case "P2003":
      case "P2014":
        return new ConflictError(
          `${resource} references a related record that prevents this operation`,
        );
      default:
        // Unknown known-request error: don't guess a client-facing meaning.
        // Non-operational 500 so the handler logs it with full context and
        // masks the message in production.
        return new AppError(
          "Database request failed",
          500,
          false,
          undefined,
          ErrorCode.INTERNAL_ERROR,
        );
    }
  }

  // Connectivity / engine startup failures → 503 Service Unavailable.
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return new AppError(
      "Service temporarily unavailable",
      503,
      false,
      undefined,
      ErrorCode.SERVICE_UNAVAILABLE,
    );
  }

  // Validation errors from Prisma indicate a programming bug, not client input.
  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError(
      "Database request failed",
      500,
      false,
      undefined,
      ErrorCode.INTERNAL_ERROR,
    );
  }

  // Not a Prisma error we recognize — hand it back untouched so the global
  // handler treats it as an unexpected 500.
  return error;
}
