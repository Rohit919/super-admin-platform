import { describe, it, expect, vi } from "vitest";
import { createHmac, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  buildTestApp,
  signTestToken,
  TEST_ENV,
} from "@core/testing/test-app.js";

const BASE_URL = "/api/v1/auth";
const SECRET = TEST_ENV.JWT_SECRET;

const hmac = (code: string) =>
  createHmac("sha256", SECRET).update(code).digest("hex");
const sha = (token: string) => createHash("sha256").update(token).digest("hex");

const MOCK_USER = {
  id: "user-1",
  email: "test@example.com",
  password: "",
  name: "Test User",
  role: "user",
  emailVerifiedAt: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  passwordChangedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── POST /verify-email ─────────────────────────────────────────────────────

describe("POST /api/v1/auth/verify-email", () => {
  it("verifies the email when the OTP matches", async () => {
    const challenge = {
      id: "otp-1",
      destination: "test@example.com",
      purpose: "EMAIL_VERIFICATION",
      userId: "user-1",
      codeHash: hmac("123456"),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    };
    const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const app = await buildTestApp({
      prisma: {
        user: { updateMany: userUpdateMany },
        otpChallenge: {
          findFirst: vi.fn().mockResolvedValue(challenge),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/verify-email`,
      payload: { email: "test@example.com", otp: "123456" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(userUpdateMany).toHaveBeenCalledOnce();
    await app.close();
  });

  it("returns 400 for a wrong OTP", async () => {
    const challenge = {
      id: "otp-1",
      destination: "test@example.com",
      purpose: "EMAIL_VERIFICATION",
      userId: "user-1",
      codeHash: hmac("999999"),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    };

    const app = await buildTestApp({
      prisma: {
        otpChallenge: {
          findFirst: vi.fn().mockResolvedValue(challenge),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/verify-email`,
      payload: { email: "test@example.com", otp: "123456" },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for a malformed OTP (schema)", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/verify-email`,
      payload: { email: "test@example.com", otp: "abc" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /forgot-password ──────────────────────────────────────────────────

describe("POST /api/v1/auth/forgot-password", () => {
  it("returns generic 200 for an unknown email (no enumeration)", async () => {
    const app = await buildTestApp({
      prisma: { user: { findUnique: vi.fn().mockResolvedValue(null) } },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/forgot-password`,
      payload: { email: "nobody@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toBeTypeOf("string");
    await app.close();
  });

  it("generates an OTP for a known email and still returns generic 200", async () => {
    const otpCreate = vi.fn().mockResolvedValue({ id: "otp-x" });
    const app = await buildTestApp({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(MOCK_USER) },
        otpChallenge: {
          create: otpCreate,
          findFirst: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/forgot-password`,
      payload: { email: "test@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(otpCreate).toHaveBeenCalledOnce();
    await app.close();
  });
});

// ─── password reset verify + confirm ────────────────────────────────────────

describe("POST /api/v1/auth/password-reset/verify", () => {
  it("returns a reset token when the OTP is valid", async () => {
    const challenge = {
      id: "otp-r",
      destination: "test@example.com",
      purpose: "PASSWORD_RESET",
      userId: "user-1",
      codeHash: hmac("654321"),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    };

    const app = await buildTestApp({
      prisma: {
        otpChallenge: {
          findFirst: vi.fn().mockResolvedValue(challenge),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
        passwordResetToken: {
          create: vi.fn().mockResolvedValue({ id: "prt-1" }),
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/password-reset/verify`,
      payload: { email: "test@example.com", otp: "654321" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.resetToken).toBeTypeOf("string");
    expect(body.data.expiresAt).toBeTypeOf("string");
    await app.close();
  });
});

describe("POST /api/v1/auth/password-reset/confirm", () => {
  it("resets the password and revokes sessions with a valid token", async () => {
    const token = "a".repeat(64);
    const resetRecord = {
      id: "prt-1",
      userId: "user-1",
      tokenHash: sha(token),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    };
    const userUpdate = vi.fn().mockResolvedValue(MOCK_USER);
    const rtUpdateMany = vi.fn().mockResolvedValue({ count: 2 });

    const app = await buildTestApp({
      prisma: {
        passwordResetToken: {
          findUnique: vi.fn().mockResolvedValue(resetRecord),
          update: vi.fn(),
        },
        user: { update: userUpdate },
        refreshToken: { updateMany: rtUpdateMany },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/password-reset/confirm`,
      payload: { resetToken: token, newPassword: "brand-new-password" },
    });

    expect(res.statusCode).toBe(200);
    expect(userUpdate).toHaveBeenCalledOnce();
    expect(rtUpdateMany).toHaveBeenCalledOnce(); // all sessions revoked
    await app.close();
  });

  it("returns 400 for an invalid reset token", async () => {
    const app = await buildTestApp({
      prisma: {
        passwordResetToken: { findUnique: vi.fn().mockResolvedValue(null) },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/password-reset/confirm`,
      payload: {
        resetToken: "b".repeat(64),
        newPassword: "brand-new-password",
      },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── authenticated: change-password + logout-all ────────────────────────────

describe("POST /api/v1/auth/change-password", () => {
  it("changes the password when the current one is correct", async () => {
    const currentHash = await bcrypt.hash("current-password", 10);
    const user = { ...MOCK_USER, password: currentHash };
    const userUpdate = vi.fn().mockResolvedValue(user);
    const rtUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const app = await buildTestApp({
      prisma: {
        user: {
          findUnique: vi.fn().mockResolvedValue(user),
          update: userUpdate,
        },
        refreshToken: { updateMany: rtUpdateMany },
      },
    });
    const jwt = signTestToken(app, {
      id: "user-1",
      email: "test@example.com",
      role: "user",
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/change-password`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: {
        currentPassword: "current-password",
        newPassword: "a-new-password",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(userUpdate).toHaveBeenCalledOnce();
    expect(rtUpdateMany).toHaveBeenCalledOnce();
    await app.close();
  });

  it("returns 401 when the current password is wrong", async () => {
    const currentHash = await bcrypt.hash("current-password", 10);
    const user = { ...MOCK_USER, password: currentHash };

    const app = await buildTestApp({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(user), update: vi.fn() },
      },
    });
    const jwt = signTestToken(app, {
      id: "user-1",
      email: "test@example.com",
      role: "user",
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/change-password`,
      headers: { authorization: `Bearer ${jwt}` },
      payload: {
        currentPassword: "wrong-password",
        newPassword: "a-new-password",
      },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 without a token", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/change-password`,
      payload: {
        currentPassword: "current-password",
        newPassword: "a-new-password",
      },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe("POST /api/v1/auth/logout-all", () => {
  it("revokes all sessions for the authenticated user", async () => {
    const rtUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
    const app = await buildTestApp({
      prisma: { refreshToken: { updateMany: rtUpdateMany } },
    });
    const jwt = signTestToken(app);

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/logout-all`,
      headers: { authorization: `Bearer ${jwt}` },
    });

    expect(res.statusCode).toBe(200);
    expect(rtUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
    await app.close();
  });

  it("returns 401 without a token", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/logout-all`,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
