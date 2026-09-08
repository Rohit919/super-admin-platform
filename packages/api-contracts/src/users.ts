import { Type, type Static } from "@sinclair/typebox";
import {
  DataEnvelope,
  PaginatedEnvelope,
  PaginationQuery,
  UserRole,
} from "./common.js";

/**
 * Users contracts — shared between the API and the admin.
 */

// ── Resource representations (API-safe; never expose passwordHash etc.) ──────
export const UserProfile = Type.Object({
  id: Type.String(),
  email: Type.String(),
  name: Type.String(),
  role: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type UserProfile = Static<typeof UserProfile>;

/** Trimmed representation for collection endpoints (API_CONVENTIONS §21). */
export const UserListItem = Type.Object({
  id: Type.String(),
  email: Type.String(),
  name: Type.String(),
  role: Type.String(),
  createdAt: Type.String(),
});
export type UserListItem = Static<typeof UserListItem>;

// ── Legacy `{ success, data }` envelopes (kept for /me + existing admin) ─────
export const UserProfileResponse = Type.Object({
  success: Type.Literal(true),
  data: UserProfile,
});
export type UserProfileResponse = Static<typeof UserProfileResponse>;

export const UserListResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Array(UserProfile),
});
export type UserListResponse = Static<typeof UserListResponse>;

// ── Canonical envelopes (API_CONVENTIONS §9–§12) ─────────────────────────────
/** Single user resource: `{ data }`. */
export const UserResponse = DataEnvelope(UserProfile);
export type UserResponse = Static<typeof UserResponse>;

/** Paginated user collection: `{ data: UserListItem[], meta }`. */
export const UsersListResponse = PaginatedEnvelope(UserListItem);
export type UsersListResponse = Static<typeof UsersListResponse>;

/** Delete confirmation: `{ data: { message } }` (canonical envelope). */
export const UserMessageResponse = DataEnvelope(
  Type.Object({ message: Type.String() }),
);
export type UserMessageResponse = Static<typeof UserMessageResponse>;

// ── Write bodies (admin-managed user CRUD) ───────────────────────────────────
/**
 * Create a user (admin). `role` is the legacy scalar role on the User record
 * (constrained to the shared UserRole union); RBAC role *assignments* are
 * managed separately via /admin/users/:id/roles. Password is required and
 * server-hashed (Argon2id) — never stored or returned in plaintext.
 */
export const CreateUserBody = Type.Object({
  email: Type.String({ format: "email", maxLength: 254 }),
  name: Type.String({ minLength: 2, maxLength: 100 }),
  password: Type.String({ minLength: 8, maxLength: 128 }),
  role: Type.Optional(UserRole),
});
export type CreateUserBody = Static<typeof CreateUserBody>;

/**
 * Admin update of another user. All fields optional; only provided fields
 * change. Password changes go through the auth change-password flow, not here.
 */
export const UpdateUserBody = Type.Object({
  email: Type.Optional(Type.String({ format: "email", maxLength: 254 })),
  name: Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  role: Type.Optional(UserRole),
});
export type UpdateUserBody = Static<typeof UpdateUserBody>;

/**
 * Self profile update (PATCH /users/me). Self-scoped (no permission gate); a
 * user may change their own name and email. Role is intentionally NOT editable
 * here — that would be a privilege change and belongs to admin/role endpoints.
 */
export const UpdateProfileBody = Type.Object({
  email: Type.Optional(Type.String({ format: "email", maxLength: 254 })),
  name: Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
});
export type UpdateProfileBody = Static<typeof UpdateProfileBody>;

/**
 * GET /users query contract: pagination + search + role filter + sorting.
 * `sortBy` is whitelisted (API_CONVENTIONS §17); never pass arbitrary columns
 * to the database.
 */
export const ListUsersQuery = Type.Composite([
  PaginationQuery,
  Type.Object({
    search: Type.Optional(
      Type.String({ maxLength: 200, description: "Matches name or email" }),
    ),
    role: Type.Optional(UserRole),
    sortBy: Type.Optional(
      Type.Union(
        [
          Type.Literal("createdAt"),
          Type.Literal("name"),
          Type.Literal("email"),
        ],
        {
          default: "createdAt",
        },
      ),
    ),
    sortOrder: Type.Optional(
      Type.Union([Type.Literal("asc"), Type.Literal("desc")], {
        default: "desc",
      }),
    ),
  }),
]);
export type ListUsersQuery = Static<typeof ListUsersQuery>;
