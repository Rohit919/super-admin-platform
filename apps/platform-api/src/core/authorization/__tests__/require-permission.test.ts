import { describe, it, expect, vi } from "vitest";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
} from "../require-permission.js";
import { PermissionKeys } from "@app/api-contracts";

/**
 * Unit tests for the permission preHandlers. We drive them with a hand-built
 * request/reply so we can assert 401/allow/403 without the full HTTP stack.
 */

function makeReply() {
  const reply = {
    statusCode: 0,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: unknown) {
      this.payload = body;
      return this;
    },
  };
  return reply as unknown as FastifyReply & {
    statusCode: number;
    payload: unknown;
  };
}

function makeRequest(opts: {
  userId?: string | null;
  permissions: string[];
}): FastifyRequest {
  // `userId: null` explicitly models an unauthenticated request; omitting it
  // defaults to an authenticated 'u1'.
  const authenticatedId =
    opts.userId === null ? undefined : (opts.userId ?? "u1");
  const ctx = {
    userId: authenticatedId ?? "",
    roles: [],
    permissions: opts.permissions,
  };
  return {
    user: authenticatedId === undefined ? undefined : { id: authenticatedId },
    id: "req-1",
    url: "/x",
    routeOptions: { url: "/x" },
    log: { warn: vi.fn() },
    server: {
      authorization: { getContextForRequest: vi.fn().mockResolvedValue(ctx) },
    },
  } as unknown as FastifyRequest;
}

// Guards now THROW canonical AppError subclasses (UnauthorizedError=401,
// ForbiddenError=403) instead of writing an ad-hoc reply — the global error
// handler renders the envelope. Allow cases resolve without throwing.
describe("requirePermission", () => {
  it("throws 401 when unauthenticated", async () => {
    await expect(
      requirePermission(PermissionKeys.UsersRead)(
        makeRequest({ userId: null, permissions: [] }),
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("allows when the permission is present", async () => {
    await expect(
      requirePermission(PermissionKeys.UsersRead)(
        makeRequest({ permissions: [PermissionKeys.UsersRead] }),
        makeReply(),
      ),
    ).resolves.toBeUndefined();
  });

  it("throws 403 when the permission is missing", async () => {
    await expect(
      requirePermission(PermissionKeys.UsersDelete)(
        makeRequest({ permissions: [PermissionKeys.UsersRead] }),
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("requireAnyPermission", () => {
  it("allows when at least one permission matches", async () => {
    await expect(
      requireAnyPermission([
        PermissionKeys.UsersDelete,
        PermissionKeys.UsersRead,
      ])(makeRequest({ permissions: [PermissionKeys.UsersRead] }), makeReply()),
    ).resolves.toBeUndefined();
  });

  it("throws 403 when none match", async () => {
    await expect(
      requireAnyPermission([
        PermissionKeys.UsersDelete,
        PermissionKeys.RolesDelete,
      ])(makeRequest({ permissions: [PermissionKeys.UsersRead] }), makeReply()),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 401 when unauthenticated", async () => {
    await expect(
      requireAnyPermission([PermissionKeys.UsersRead])(
        makeRequest({ userId: null, permissions: [] }),
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("requireAllPermissions", () => {
  it("allows when all permissions are present", async () => {
    await expect(
      requireAllPermissions([
        PermissionKeys.UsersRead,
        PermissionKeys.RolesRead,
      ])(
        makeRequest({
          permissions: [PermissionKeys.UsersRead, PermissionKeys.RolesRead],
        }),
        makeReply(),
      ),
    ).resolves.toBeUndefined();
  });

  it("throws 403 when one is missing", async () => {
    await expect(
      requireAllPermissions([
        PermissionKeys.UsersRead,
        PermissionKeys.RolesRead,
      ])(makeRequest({ permissions: [PermissionKeys.UsersRead] }), makeReply()),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 401 when unauthenticated", async () => {
    await expect(
      requireAllPermissions([PermissionKeys.UsersRead])(
        makeRequest({ userId: null, permissions: [] }),
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
