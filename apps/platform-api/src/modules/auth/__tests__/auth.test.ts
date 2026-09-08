import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import { buildTestApp, signTestToken } from "@core/testing/test-app.js";

// ─── shared fixtures ──────────────────────────────────────────────────────────

const HASHED_PASSWORD = await bcrypt.hash("password123", 10);

const MOCK_USER = {
  id: "user-test-id",
  email: "test@example.com",
  password: HASHED_PASSWORD,
  name: "Test User",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BASE_URL = "/api/v1/auth";

// ─── POST /login ──────────────────────────────────────────────────────────────

describe("POST /api/v1/auth/login", () => {
  it("returns 200 with accessToken and refreshToken on valid credentials", async () => {
    const app = await buildTestApp({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(MOCK_USER) },
        refreshToken: {
          create: vi
            .fn()
            .mockResolvedValue({ id: "rt-1", token: "refresh-abc" }),
          findUnique: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/login`,
      payload: { email: "test@example.com", password: "password123" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTypeOf("string");
    // Refresh token is delivered as an HTTP-only cookie, not in the body.
    expect(body.data.refreshToken).toBeUndefined();
    const setCookie = res.headers["set-cookie"];
    expect(String(setCookie)).toMatch(/refreshToken=/);
    expect(String(setCookie)).toMatch(/HttpOnly/i);
    expect(String(setCookie)).toMatch(/SameSite=Strict/i);
    expect(body.data.user.email).toBe("test@example.com");
    expect(body.data.user).not.toHaveProperty("password");

    await app.close();
  });

  it("returns 401 for unknown email", async () => {
    const app = await buildTestApp({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(null) },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/login`,
      payload: { email: "nobody@example.com", password: "password123" },
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("returns 401 for wrong password", async () => {
    const app = await buildTestApp({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(MOCK_USER) },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/login`,
      payload: { email: "test@example.com", password: "wrongpassword" },
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("returns 400 for invalid email format", async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/login`,
      payload: { email: "not-an-email", password: "password123" },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it("returns 400 when password is too short", async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/login`,
      payload: { email: "test@example.com", password: "123" },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });
});

// ─── POST /register ───────────────────────────────────────────────────────────

describe("POST /api/v1/auth/register", () => {
  it("returns 201 with tokens on successful registration", async () => {
    const app = await buildTestApp({
      prisma: {
        user: {
          findUnique: vi.fn().mockResolvedValue(null), // no duplicate
          create: vi.fn().mockResolvedValue(MOCK_USER),
        },
        refreshToken: {
          create: vi
            .fn()
            .mockResolvedValue({ id: "rt-2", token: "refresh-xyz" }),
          findUnique: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/register`,
      payload: {
        email: "new@example.com",
        password: "password123",
        name: "New User",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTypeOf("string");
    expect(body.data.refreshToken).toBeUndefined();
    expect(String(res.headers["set-cookie"])).toMatch(
      /refreshToken=.*HttpOnly/i,
    );
    expect(body.data.user.name).toBe("Test User");

    await app.close();
  });

  it("returns 400 when email is already registered", async () => {
    const app = await buildTestApp({
      prisma: {
        user: {
          findUnique: vi.fn().mockResolvedValue(MOCK_USER), // duplicate
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/register`,
      payload: {
        email: "test@example.com",
        password: "password123",
        name: "Dup User",
      },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it("returns 400 when name is missing", async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/register`,
      payload: { email: "test@example.com", password: "password123" },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });
});

// ─── POST /refresh ────────────────────────────────────────────────────────────

describe("POST /api/v1/auth/refresh", () => {
  const STORED_TOKEN = {
    id: "rt-stored",
    token: "valid-refresh-token",
    userId: MOCK_USER.id,
    expiresAt: new Date(Date.now() + 86_400_000), // 1 day from now
    revokedAt: null,
    createdAt: new Date(),
    user: MOCK_USER,
  };

  it("returns 200 with new token pair and rotates the refresh token", async () => {
    const updateMock = vi
      .fn()
      .mockResolvedValue({ ...STORED_TOKEN, revokedAt: new Date() });
    const createMock = vi
      .fn()
      .mockResolvedValue({ id: "rt-new", token: "new-refresh-token" });

    const app = await buildTestApp({
      prisma: {
        refreshToken: {
          findUnique: vi.fn().mockResolvedValue(STORED_TOKEN),
          update: updateMock,
          create: createMock,
          updateMany: vi.fn(),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/refresh`,
      headers: { cookie: "refreshToken=valid-refresh-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTypeOf("string");
    expect(body.data.refreshToken).toBeUndefined();

    // Old token must have been revoked
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rt-stored" } }),
    );

    await app.close();
  });

  it("returns 401 for an unknown refresh token", async () => {
    const app = await buildTestApp({
      prisma: {
        refreshToken: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
          create: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/refresh`,
      headers: { cookie: "refreshToken=does-not-exist" },
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("returns 401 for an already-revoked refresh token", async () => {
    const app = await buildTestApp({
      prisma: {
        refreshToken: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ ...STORED_TOKEN, revokedAt: new Date() }),
          update: vi.fn(),
          create: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/refresh`,
      headers: { cookie: "refreshToken=valid-refresh-token" },
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("returns 401 for an expired refresh token", async () => {
    const app = await buildTestApp({
      prisma: {
        refreshToken: {
          findUnique: vi.fn().mockResolvedValue({
            ...STORED_TOKEN,
            expiresAt: new Date(Date.now() - 1000), // past
          }),
          update: vi.fn(),
          create: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/refresh`,
      headers: { cookie: "refreshToken=valid-refresh-token" },
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

describe("POST /api/v1/auth/logout", () => {
  it("returns 200 and revokes the token", async () => {
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });

    const app = await buildTestApp({
      prisma: {
        refreshToken: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: updateManyMock,
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/logout`,
      headers: { cookie: "refreshToken=any-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(updateManyMock).toHaveBeenCalledOnce();

    await app.close();
  });

  it("returns 200 even for an unknown token (idempotent)", async () => {
    const app = await buildTestApp({
      prisma: {
        refreshToken: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }), // nothing matched
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/logout`,
      headers: { cookie: "refreshToken=ghost-token" },
    });

    expect(res.statusCode).toBe(200);

    await app.close();
  });
});

// ─── GET /verify ──────────────────────────────────────────────────────────────

describe("GET /api/v1/auth/verify", () => {
  it("returns 200 with user payload for a valid token", async () => {
    const app = await buildTestApp();
    const token = signTestToken(app);

    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/verify`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe("test@example.com");

    await app.close();
  });

  it("returns 401 when no token is provided", async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/verify`,
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("returns 401 for a tampered token", async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/verify`,
      headers: { authorization: "Bearer totally.fake.token" },
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });
});

// ─── Phase 1 — Account lockout (REQ-006) ────────────────────────────────────

describe("POST /api/v1/auth/login — account lockout", () => {
  it("returns 429 when the account is already locked", async () => {
    const lockedUser = {
      ...MOCK_USER,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // locked 10 min out
    };

    const app = await buildTestApp({
      prisma: {
        user: {
          findUnique: vi.fn().mockResolvedValue(lockedUser),
          update: vi.fn(),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/login`,
      payload: { email: "test@example.com", password: "password123" },
    });

    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error.retryAfter).toBeGreaterThan(0);

    await app.close();
  });

  it("increments failed attempts and locks after the 5th failure", async () => {
    const userAtFour = {
      ...MOCK_USER,
      failedLoginAttempts: 4,
      lockedUntil: null,
    };
    const updateMock = vi.fn().mockResolvedValue(userAtFour);

    const app = await buildTestApp({
      prisma: {
        user: {
          findUnique: vi.fn().mockResolvedValue(userAtFour),
          update: updateMock,
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/login`,
      payload: { email: "test@example.com", password: "wrongpassword" },
    });

    expect(res.statusCode).toBe(401);
    // 5th failure → update must set lockedUntil
    const updateArg = updateMock.mock.calls[0]?.[0];
    expect(updateArg.data.failedLoginAttempts).toBe(5);
    expect(updateArg.data.lockedUntil).toBeInstanceOf(Date);

    await app.close();
  });

  it("resets counters on successful login", async () => {
    const updateMock = vi.fn().mockResolvedValue(MOCK_USER);

    const app = await buildTestApp({
      prisma: {
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ ...MOCK_USER, failedLoginAttempts: 3 }),
          update: updateMock,
        },
        refreshToken: { create: vi.fn().mockResolvedValue({ id: "rt" }) },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/login`,
      payload: { email: "test@example.com", password: "password123" },
    });

    expect(res.statusCode).toBe(200);
    const updateArg = updateMock.mock.calls[0]?.[0];
    expect(updateArg.data.failedLoginAttempts).toBe(0);
    expect(updateArg.data.lockedUntil).toBeNull();

    await app.close();
  });
});

// ─── Phase 1 — Refresh token family detection (REQ-010) ─────────────────────

describe("POST /api/v1/auth/refresh — family reuse detection", () => {
  it("revokes the entire family when a revoked token is reused", async () => {
    const revokedToken = {
      id: "rt-old",
      token: "reused-token",
      family: "fam-123",
      userId: MOCK_USER.id,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: new Date(Date.now() - 1000), // already revoked
      createdAt: new Date(),
      user: MOCK_USER,
    };
    const updateManyMock = vi.fn().mockResolvedValue({ count: 3 });

    const app = await buildTestApp({
      prisma: {
        refreshToken: {
          findUnique: vi.fn().mockResolvedValue(revokedToken),
          update: vi.fn(),
          create: vi.fn(),
          updateMany: updateManyMock,
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/refresh`,
      headers: { cookie: "refreshToken=reused-token" },
    });

    expect(res.statusCode).toBe(401);
    // The whole family must have been revoked
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ family: "fam-123" }),
      }),
    );

    await app.close();
  });
});

// ─── Phase 3 — mass-assignment protection (REQ-109) ─────────────────────────

describe("POST /api/v1/auth/register — additionalProperties stripping", () => {
  it("ignores an injected role field (mass-assignment defence)", async () => {
    const createMock = vi
      .fn()
      .mockResolvedValue({ ...MOCK_USER, role: "user" });

    const app = await buildTestApp({
      prisma: {
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: createMock,
        },
        refreshToken: { create: vi.fn().mockResolvedValue({ id: "rt" }) },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/register`,
      payload: {
        email: "attacker@example.com",
        password: "password123",
        name: "Attacker",
        role: "admin", // not in schema — must be stripped
      },
    });

    expect(res.statusCode).toBe(201);
    // The Prisma create must have been called with role 'user', never 'admin'.
    const createArg = createMock.mock.calls[0]?.[0];
    expect(createArg.data.role).toBe("user");

    await app.close();
  });
});
