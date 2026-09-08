import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  ValidationError,
  UnauthorizedError,
  RateLimitError,
  ErrorCode,
} from "@core/errors/index.js";
import { AUTH_CONTRACTS, toFastifySchema } from "@app/api-contracts";
import type {
  LoginBody,
  RegisterBody,
  ChangePasswordBody,
} from "@app/api-contracts";
import { parseDurationMs } from "@core/utils/index.js";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  buildTokenPayload,
} from "./operations/index.js";

// ─── constants ────────────────────────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 min

// Timing-safe "user not found" — a valid Argon2id hash that will always fail.
// Verifying against this takes the same time as verifying a real hash,
// preventing timing attacks that reveal whether an email is registered.
// Must match the current hashing algorithm (Argon2id) so timings line up.
const FAKE_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$Z/GSeO9vB/KUbJQoEK4U0g$82zFMwbv7/pU+17fJgmv37rbuOhGwkfXmjv5Y9JRKSc";

// Refresh token cookie: HTTP-only (no JS access), SameSite=Strict (CSRF), and
// Path-scoped to the refresh endpoint so it isn't sent on every request.
const REFRESH_COOKIE = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

function setRefreshCookie(
  reply: FastifyReply,
  token: string,
  secure: boolean,
  maxAgeMs: number,
): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function createRefreshToken(
  prisma: FastifyPluginAsyncTypebox extends never ? never : any,
  userId: string,
  expiresIn: string,
  family?: string,
): Promise<{ token: string; family: string }> {
  const token = crypto.randomUUID();
  const tokenFamily = family ?? crypto.randomUUID(); // new login = new family
  const expiresAt = new Date(Date.now() + parseDurationMs(expiresIn));
  await prisma.refreshToken.create({
    data: { token, family: tokenFamily, userId, expiresAt },
  });
  return { token, family: tokenFamily };
}

// ─── plugin ───────────────────────────────────────────────────────────────────

const authRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // ── POST /login ─────────────────────────────────────────────────────────────
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (req: FastifyRequest) => {
            const email = (req.body as { email?: string } | undefined)?.email;
            return `login:${(email ?? req.ip).toLowerCase()}`;
          },
        },
      },
      // Contract-driven schema — body/response + documented error responses
      // (401/400/429) all come from AUTH_CONTRACTS.LOGIN.
      schema: toFastifySchema(AUTH_CONTRACTS.LOGIN),
    },
    async (request, reply) => {
      // toFastifySchema returns a generic schema, so re-apply the contract's
      // inferred body type (runtime validation still uses the contract schema).
      const { email, password } = request.body as LoginBody;

      const user = await fastify.prisma.user.findUnique({ where: { email } });

      if (!user) {
        // Timing-safe: still run bcrypt so response time matches a wrong-password path.
        await verifyPassword(password, FAKE_HASH);
        throw new UnauthorizedError(
          "Invalid credentials",
          ErrorCode.INVALID_CREDENTIALS,
        );
      }

      // Check lockout BEFORE bcrypt (saves the expensive compare on locked accounts).
      // Emits the canonical envelope + Retry-After via the global handler.
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const retryAfter = Math.ceil(
          (user.lockedUntil.getTime() - Date.now()) / 1000,
        );
        throw new RateLimitError(
          "Account temporarily locked. Try again later.",
          retryAfter,
        );
      }

      const isValid = await verifyPassword(password, user.password);

      if (!isValid) {
        const newAttempts = user.failedLoginAttempts + 1;
        const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;

        await fastify.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: newAttempts,
            ...(shouldLock
              ? { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) }
              : {}),
          },
        });

        throw new UnauthorizedError(
          "Invalid credentials",
          ErrorCode.INVALID_CREDENTIALS,
        );
      }

      // Success — reset lockout counters. Transparently upgrade legacy/weaker
      // password hashes to the current Argon2id parameters (SECURITY.md §7).
      const rehashed = needsRehash(user.password)
        ? await hashPassword(password)
        : undefined;

      await fastify.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          ...(rehashed ? { password: rehashed } : {}),
        },
      });

      // Resolve the active tenant + permissionVersion into the token payload.
      const accessToken = fastify.jwt.sign(
        await buildTokenPayload(fastify.prisma, user),
      );
      const { token: refreshToken } = await createRefreshToken(
        fastify.prisma,
        user.id,
        fastify.config.REFRESH_TOKEN_EXPIRES_IN,
        // undefined = new family for this login session
      );

      setRefreshCookie(
        reply,
        refreshToken,
        fastify.config.HTTPS_ONLY,
        parseDurationMs(fastify.config.REFRESH_TOKEN_EXPIRES_IN),
      );

      return reply.send({
        success: true,
        data: {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
      });
    },
  );

  // ── POST /register ───────────────────────────────────────────────────────────
  fastify.post(
    "/register",
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "1 hour",
          keyGenerator: (req: FastifyRequest) => `register:${req.ip}`,
        },
      },
      schema: toFastifySchema(AUTH_CONTRACTS.REGISTER),
    },
    async (request, reply) => {
      const { email, password, name } = request.body as RegisterBody;

      const existing = await fastify.prisma.user.findUnique({
        where: { email },
      });
      if (existing) throw new ValidationError("Email already registered");

      const hashedPassword = await hashPassword(password);
      const user = await fastify.prisma.user.create({
        data: { email, password: hashedPassword, name, role: "user" },
      });

      // A freshly registered user has no membership yet, so the token carries
      // no tenant until they are invited/provisioned (MULTI-TENANT §128-130).
      const accessToken = fastify.jwt.sign(
        await buildTokenPayload(fastify.prisma, user),
      );
      const { token: refreshToken } = await createRefreshToken(
        fastify.prisma,
        user.id,
        fastify.config.REFRESH_TOKEN_EXPIRES_IN,
      );

      setRefreshCookie(
        reply,
        refreshToken,
        fastify.config.HTTPS_ONLY,
        parseDurationMs(fastify.config.REFRESH_TOKEN_EXPIRES_IN),
      );

      return reply.status(201).send({
        success: true,
        data: {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
      });
    },
  );

  // ── POST /refresh ────────────────────────────────────────────────────────────
  fastify.post(
    "/refresh",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) => {
            const rt = req.cookies?.[REFRESH_COOKIE];
            return `refresh:${rt?.slice(0, 8) ?? req.ip}`;
          },
        },
      },
      // Refresh token comes from the HTTP-only cookie, not the body.
      schema: toFastifySchema(AUTH_CONTRACTS.REFRESH, { omitBody: true }),
    },
    async (request, reply) => {
      const refreshToken = request.cookies?.[REFRESH_COOKIE];

      if (!refreshToken) {
        throw new UnauthorizedError(
          "Missing refresh token",
          ErrorCode.TOKEN_MISSING,
        );
      }

      const stored = await fastify.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!stored) {
        throw new UnauthorizedError(
          "Invalid refresh token",
          ErrorCode.TOKEN_INVALID,
        );
      }

      // ── Stolen token detection ────────────────────────────────────────────
      // If this token is already revoked, someone re-used a superseded token.
      // Revoke the ENTIRE family — both the attacker and the legitimate user
      // lose their sessions. Force re-login.
      if (stored.revokedAt) {
        await fastify.prisma.refreshToken.updateMany({
          where: { family: stored.family, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        fastify.log.warn(
          { userId: stored.userId, family: stored.family },
          "Refresh token reuse detected — session family revoked",
        );
        throw new UnauthorizedError(
          "Session invalidated due to suspicious activity. Please log in again.",
          ErrorCode.TOKEN_REVOKED,
        );
      }

      if (stored.expiresAt < new Date()) {
        throw new UnauthorizedError(
          "Refresh token expired",
          ErrorCode.TOKEN_EXPIRED,
        );
      }

      // Revoke current token and issue a new one in the SAME family.
      await fastify.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      const { user } = stored;
      // Rebuild the payload on refresh: re-reads the current permissionVersion
      // (so a refresh picks up permission changes) and re-resolves the active
      // tenant (dropping it if the membership/tenant is no longer ACTIVE).
      const newAccessToken = fastify.jwt.sign(
        await buildTokenPayload(fastify.prisma, user),
      );
      const { token: newRefreshToken } = await createRefreshToken(
        fastify.prisma,
        user.id,
        fastify.config.REFRESH_TOKEN_EXPIRES_IN,
        stored.family, // continue the same family
      );

      setRefreshCookie(
        reply,
        newRefreshToken,
        fastify.config.HTTPS_ONLY,
        parseDurationMs(fastify.config.REFRESH_TOKEN_EXPIRES_IN),
      );

      return reply.send({
        success: true,
        data: { accessToken: newAccessToken },
      });
    },
  );

  // ── POST /logout ─────────────────────────────────────────────────────────────
  fastify.post(
    "/logout",
    {
      schema: toFastifySchema(AUTH_CONTRACTS.LOGOUT, { omitBody: true }),
    },
    async (request, reply) => {
      const refreshToken = request.cookies?.[REFRESH_COOKIE];
      if (refreshToken) {
        await fastify.prisma.refreshToken.updateMany({
          where: { token: refreshToken, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      return reply.send({
        success: true,
        data: { message: "Logged out successfully" },
      });
    },
  );

  // ── GET /verify ──────────────────────────────────────────────────────────────
  fastify.get(
    "/verify",
    {
      preValidation: [fastify.authenticate],
      schema: toFastifySchema(AUTH_CONTRACTS.VERIFY),
    },
    async (request, reply) => {
      return reply.send({ success: true, data: { user: request.user } });
    },
  );

  // ── POST /logout-all ───────────────────────────────────────────────────────
  // Revoke every active session for the authenticated user (log out everywhere).
  fastify.post(
    "/logout-all",
    {
      preValidation: [fastify.authenticate],
      schema: toFastifySchema(AUTH_CONTRACTS.LOGOUT_ALL, { omitBody: true }),
    },
    async (request, reply) => {
      await fastify.prisma.refreshToken.updateMany({
        where: { userId: request.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      return reply.send({
        success: true,
        data: { message: "Logged out of all sessions" },
      });
    },
  );

  // ── POST /change-password ──────────────────────────────────────────────────
  // Authenticated password change: verify current password, set new one, and
  // revoke all other sessions (keeps the current session's cookie cleared too).
  fastify.post(
    "/change-password",
    {
      preValidation: [fastify.authenticate],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (req: FastifyRequest) =>
            `change-password:${req.user?.id ?? req.ip}`,
        },
      },
      schema: toFastifySchema(AUTH_CONTRACTS.CHANGE_PASSWORD),
    },
    async (request, reply) => {
      const { currentPassword, newPassword } =
        request.body as ChangePasswordBody;

      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
      });
      if (!user) throw new UnauthorizedError("User not found");

      const valid = await verifyPassword(currentPassword, user.password);
      if (!valid) throw new UnauthorizedError("Current password is incorrect");

      const hashed = await hashPassword(newPassword);
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { password: hashed, passwordChangedAt: new Date() },
      });

      // Revoke all sessions — the user must re-authenticate everywhere.
      await fastify.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });

      fastify.log.info({ userId: user.id }, "auth.password_changed");

      return reply.send({
        success: true,
        data: { message: "Password changed. Please log in again." },
      });
    },
  );
};

export default authRoutes;
