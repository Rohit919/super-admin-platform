import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { Prisma } from "@prisma/client";
import { USER_ROUTES, USER_CONTRACTS } from "@app/api-contracts";
import type {
  PermissionKey,
  ListUsersQuery,
  CreateUserBody,
  UpdateUserBody,
  UpdateProfileBody,
} from "@app/api-contracts";
import { requirePermission } from "@core/authorization/index.js";
import { AuditService, AuditActions } from "@core/audit/index.js";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from "@core/errors/index.js";
import { normalizePagination, buildPageMeta } from "@core/utils/index.js";
import { hashPassword } from "../auth/operations/index.js";

/**
 * Users routes — consume the shared Level 2 contracts (API_CONTRACTS §80).
 * Method, schemas, auth, and permission metadata all come from USER_CONTRACTS;
 * the route file only owns registration + the handler. Registration paths are
 * relative to the `/users` module prefix (USER_ROUTES) while the contract
 * carries the absolute path for the Admin/tests.
 *
 * Surface:
 *   GET    /          users.read    — paginated list
 *   POST   /          users.create  — create a user
 *   GET    /me        (self)        — profile + effective roles/permissions
 *   PATCH  /me        (self)        — update own name/email
 *   GET    /:userId   users.read    — get a user by id
 *   PATCH  /:userId   users.update  — update a user
 *   DELETE /:userId   users.delete  — delete a user
 */
const userRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const listContract = USER_CONTRACTS.LIST;
  const meContract = USER_CONTRACTS.ME;
  const audit = new AuditService(fastify.prisma);

  // Public (API-safe) fields returned for a single user. Never selects password.
  const userSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  type UserRow = {
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  };

  const serialize = (u: UserRow) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  });

  // ── GET / (paginated list) ────────────────────────────────────────────────
  fastify.get(
    USER_ROUTES.LIST,
    {
      preValidation: [fastify.authenticate],
      preHandler: [requirePermission(listContract.permission as PermissionKey)],
      schema: {
        summary: listContract.summary,
        description: listContract.description,
        tags: listContract.tags,
        operationId: listContract.operationId,
        security: [{ bearerAuth: [] }],
        querystring: listContract.query,
        response: listContract.response,
      },
    },
    async (request, reply) => {
      const query = request.query as ListUsersQuery;
      const { page, pageSize, skip, take } = normalizePagination(query);
      const { search, role, sortBy = "createdAt", sortOrder = "desc" } = query;

      // Whitelisted, validated filters only — never raw client SQL/columns.
      const where: Prisma.UserWhereInput = {
        ...(role ? { role } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [rows, total] = await Promise.all([
        fastify.prisma.user.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          skip,
          take,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
          },
        }),
        fastify.prisma.user.count({ where }),
      ]);

      return reply.send({
        data: rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
        meta: buildPageMeta(page, pageSize, total),
      });
    },
  );

  // ── POST / (create) ───────────────────────────────────────────────────────
  fastify.post(
    USER_ROUTES.LIST,
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(USER_CONTRACTS.CREATE.permission as PermissionKey),
      ],
      schema: {
        summary: USER_CONTRACTS.CREATE.summary,
        tags: USER_CONTRACTS.CREATE.tags,
        operationId: USER_CONTRACTS.CREATE.operationId,
        security: [{ bearerAuth: [] }],
        body: USER_CONTRACTS.CREATE.body,
        response: { 201: USER_CONTRACTS.CREATE.response![201] },
      },
    },
    async (request, reply) => {
      const { email, name, password, role } = request.body as CreateUserBody;
      const normalizedEmail = email.trim().toLowerCase();

      const existing = await fastify.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing) {
        throw new ConflictError(
          "Email already registered",
          undefined,
          "USER_EMAIL_EXISTS",
        );
      }

      const hashed = await hashPassword(password);
      const user = await fastify.prisma.user.create({
        data: {
          email: normalizedEmail,
          name,
          password: hashed,
          role: role ?? "user",
        },
        select: userSelect,
      });

      await audit.record({
        ...AuditService.contextFrom(request),
        action: AuditActions.UserCreated,
        targetType: "USER",
        targetId: user.id,
        metadata: { email: user.email, role: user.role },
      });

      return reply.status(201).send({ data: serialize(user) });
    },
  );

  // ── GET /me ─────────────────────────────────────────────────────────────────
  // Returns the authenticated profile PLUS the caller's effective roles and
  // permissions so the admin frontend can drive permission-aware UI. UX only —
  // the API still enforces every permission server-side.
  fastify.get(
    USER_ROUTES.ME,
    {
      preValidation: [fastify.authenticate],
      schema: {
        summary: meContract.summary,
        tags: meContract.tags,
        operationId: meContract.operationId,
        security: [{ bearerAuth: [] }],
        response: meContract.response,
      },
    },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        select: userSelect,
      });

      if (!user) {
        throw new NotFoundError("User not found", "USER_NOT_FOUND");
      }

      // Effective roles/permissions are scoped to the ACTIVE tenant so the
      // Admin's permission-aware UI reflects what the user can do in this
      // tenant (platform roles like SUPER_ADMIN still apply everywhere).
      const ctx = await fastify.authorization.getContext(
        user.id,
        request.tenant?.tenantId,
      );

      // Include the active tenant (if any) so the Admin bootstraps tenant + user
      // + permissions in one call (MULTI-TENANT §33, §115).
      const tenant = request.tenant
        ? await fastify.prisma.tenant.findUnique({
            where: { id: request.tenant.tenantId },
            select: { id: true, name: true, slug: true, status: true },
          })
        : null;

      return reply.send({
        success: true,
        data: {
          ...serialize(user),
          roles: ctx.roles,
          permissions: ctx.permissions,
          ...(tenant ? { tenant } : {}),
        },
      });
    },
  );

  // ── PATCH /me (self profile update) ─────────────────────────────────────────
  // Self-scoped: no permission gate — the target is always the caller. A user
  // may change their own name/email (not role — that is a privilege change).
  fastify.patch(
    USER_ROUTES.ME,
    {
      preValidation: [fastify.authenticate],
      schema: {
        summary: USER_CONTRACTS.UPDATE_ME.summary,
        tags: USER_CONTRACTS.UPDATE_ME.tags,
        operationId: USER_CONTRACTS.UPDATE_ME.operationId,
        security: [{ bearerAuth: [] }],
        body: USER_CONTRACTS.UPDATE_ME.body,
        response: USER_CONTRACTS.UPDATE_ME.response,
      },
    },
    async (request, reply) => {
      const body = request.body as UpdateProfileBody;
      const data = await buildUserUpdate(fastify, request.user.id, {
        email: body.email,
        name: body.name,
      });

      const user = await fastify.prisma.user.update({
        where: { id: request.user.id },
        data,
        select: userSelect,
      });

      await audit.record({
        ...AuditService.contextFrom(request),
        action: AuditActions.ProfileUpdated,
        targetType: "USER",
        targetId: user.id,
        metadata: { fields: Object.keys(data) },
      });

      return reply.send({ data: serialize(user) });
    },
  );

  // ── GET /:userId ──────────────────────────────────────────────────────────
  fastify.get(
    USER_ROUTES.BY_ID,
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(USER_CONTRACTS.GET_BY_ID.permission as PermissionKey),
      ],
      schema: {
        summary: USER_CONTRACTS.GET_BY_ID.summary,
        tags: USER_CONTRACTS.GET_BY_ID.tags,
        operationId: USER_CONTRACTS.GET_BY_ID.operationId,
        security: [{ bearerAuth: [] }],
        params: USER_CONTRACTS.GET_BY_ID.params,
        response: USER_CONTRACTS.GET_BY_ID.response,
      },
    },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: userSelect,
      });
      if (!user) throw new NotFoundError("User not found", "USER_NOT_FOUND");
      return reply.send({ data: serialize(user) });
    },
  );

  // ── PATCH /:userId (admin update) ───────────────────────────────────────────
  fastify.patch(
    USER_ROUTES.BY_ID,
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(USER_CONTRACTS.UPDATE.permission as PermissionKey),
      ],
      schema: {
        summary: USER_CONTRACTS.UPDATE.summary,
        tags: USER_CONTRACTS.UPDATE.tags,
        operationId: USER_CONTRACTS.UPDATE.operationId,
        security: [{ bearerAuth: [] }],
        params: USER_CONTRACTS.UPDATE.params,
        body: USER_CONTRACTS.UPDATE.body,
        response: USER_CONTRACTS.UPDATE.response,
      },
    },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const body = request.body as UpdateUserBody;

      const target = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!target) throw new NotFoundError("User not found", "USER_NOT_FOUND");

      const data = await buildUserUpdate(fastify, userId, body);

      const user = await fastify.prisma.user.update({
        where: { id: userId },
        data,
        select: userSelect,
      });

      await audit.record({
        ...AuditService.contextFrom(request),
        action: AuditActions.UserUpdated,
        targetType: "USER",
        targetId: user.id,
        metadata: { fields: Object.keys(data) },
      });

      return reply.send({ data: serialize(user) });
    },
  );

  // ── DELETE /:userId ─────────────────────────────────────────────────────────
  fastify.delete(
    USER_ROUTES.BY_ID,
    {
      preValidation: [fastify.authenticate],
      preHandler: [
        requirePermission(USER_CONTRACTS.DELETE.permission as PermissionKey),
      ],
      schema: {
        summary: USER_CONTRACTS.DELETE.summary,
        tags: USER_CONTRACTS.DELETE.tags,
        operationId: USER_CONTRACTS.DELETE.operationId,
        security: [{ bearerAuth: [] }],
        params: USER_CONTRACTS.DELETE.params,
        response: USER_CONTRACTS.DELETE.response,
      },
    },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };

      // Self-delete guard: an admin cannot delete their own account (avoids
      // accidental lockout / removing the acting administrator).
      if (userId === request.user.id) {
        throw new ForbiddenError("You cannot delete your own account");
      }

      const target = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });
      if (!target) throw new NotFoundError("User not found", "USER_NOT_FOUND");

      await fastify.prisma.user.delete({ where: { id: userId } });

      await audit.record({
        ...AuditService.contextFrom(request),
        action: AuditActions.UserDeleted,
        targetType: "USER",
        targetId: target.id,
        metadata: { email: target.email },
      });

      return reply.send({ data: { message: "User deleted" } });
    },
  );
};

/**
 * Build a validated Prisma update payload from a partial {name,email,role}.
 * Normalizes + uniqueness-checks email (excluding the target user) so a
 * duplicate surfaces as a 409 Conflict rather than a raw Prisma P2002.
 */
async function buildUserUpdate(
  fastify: Parameters<FastifyPluginAsyncTypebox>[0],
  userId: string,
  input: { name?: string; email?: string; role?: string },
): Promise<Prisma.UserUpdateInput> {
  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;

  if (input.email !== undefined) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const clash = await fastify.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (clash && clash.id !== userId) {
      throw new ConflictError(
        "Email already registered",
        undefined,
        "USER_EMAIL_EXISTS",
      );
    }
    data.email = normalizedEmail;
  }

  return data;
}

export default userRoutes;
