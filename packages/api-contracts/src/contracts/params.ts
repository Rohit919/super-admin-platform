import { Type, type Static } from "@sinclair/typebox";

/**
 * Shared path-parameter schemas (API_CONTRACTS §11, §36).
 *
 * IDs in this project are cuid strings, so `IdSchema` is a bounded non-empty
 * string rather than a strict UUID. Validating path ids before hitting the DB
 * is defence in depth.
 */
export const IdSchema = Type.String({ minLength: 1, maxLength: 64 });

export const UserIdParams = Type.Object({ userId: IdSchema });
export type UserIdParams = Static<typeof UserIdParams>;

/** For routes registered as `:id` (roles, todos, etc.). */
export const IdParams = Type.Object({ id: IdSchema });
export type IdParams = Static<typeof IdParams>;
