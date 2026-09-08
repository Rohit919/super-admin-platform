import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyRequest } from "fastify";
import { ValidationError, ErrorCode } from "@core/errors/index.js";
import { AUTH_CONTRACTS, toFastifySchema } from "@app/api-contracts";
import { OtpService, sendEmail } from "./services/index.js";
import { hashPassword } from "./operations/index.js";

// Generic response used by enumeration-safe endpoints (forgot-password,
// resend-verification). The wording never reveals whether an account exists.
const GENERIC_OTP_MESSAGE =
  "If an account matches, a verification code has been sent.";

const ipKey = (prefix: string) => (req: FastifyRequest) =>
  `${prefix}:${req.ip}`;

const recoveryRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const otp = new OtpService({
    prisma: fastify.prisma,
    secret: fastify.config.JWT_SECRET,
  });

  // ── POST /verify-email ────────────────────────────────────────────────────
  fastify.post(
    "/verify-email",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 hour",
          keyGenerator: (req: FastifyRequest) => {
            const email = (req.body as { email?: string } | undefined)?.email;
            return `verify-email:${(email ?? req.ip).toLowerCase()}`;
          },
        },
      },
      schema: toFastifySchema(AUTH_CONTRACTS.VERIFY_EMAIL),
    },
    async (request, reply) => {
      const { email, otp: code } = request.body as {
        email: string;
        otp: string;
      };

      const result = await otp.verify({
        destination: email,
        purpose: "EMAIL_VERIFICATION",
        code,
      });

      // Uniform failure — do not distinguish wrong/expired/unknown.
      if (!result.ok) {
        throw new ValidationError(
          "Invalid or expired verification code.",
          undefined,
          ErrorCode.OTP_INVALID,
        );
      }

      // Mark the account verified. Resolve the user by challenge userId when
      // present, otherwise by the (normalised) email.
      const where = result.userId
        ? { id: result.userId }
        : { email: email.trim().toLowerCase() };
      await fastify.prisma.user.updateMany({
        where,
        data: { emailVerifiedAt: new Date() },
      });

      return reply.send({
        success: true,
        data: { message: "Email verified successfully." },
      });
    },
  );

  // ── POST /resend-verification ──────────────────────────────────────────────
  fastify.post(
    "/resend-verification",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
          keyGenerator: (req: FastifyRequest) => {
            const email = (req.body as { email?: string } | undefined)?.email;
            return `resend-verification:${(email ?? req.ip).toLowerCase()}`;
          },
        },
      },
      schema: toFastifySchema(AUTH_CONTRACTS.RESEND_VERIFICATION),
    },
    async (request, reply) => {
      const email = (request.body as { email: string }).email
        .trim()
        .toLowerCase();
      const user = await fastify.prisma.user.findUnique({ where: { email } });

      // Only generate/send when the account exists AND is not already verified.
      // Response is identical regardless, to prevent enumeration.
      if (user && !user.emailVerifiedAt) {
        const { code } = await otp.generate({
          destination: email,
          purpose: "EMAIL_VERIFICATION",
          userId: user.id,
        });
        await sendEmail({
          to: email,
          subject: "Verify your email",
          text: `Your verification code is ${code}. It expires in 5 minutes.`,
        });
      }

      return reply.send({
        success: true,
        data: { message: GENERIC_OTP_MESSAGE },
      });
    },
  );

  // ── POST /forgot-password ──────────────────────────────────────────────────
  fastify.post(
    "/forgot-password",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
          keyGenerator: (req: FastifyRequest) => {
            const email = (req.body as { email?: string } | undefined)?.email;
            return `forgot-password:${(email ?? req.ip).toLowerCase()}`;
          },
        },
      },
      schema: toFastifySchema(AUTH_CONTRACTS.FORGOT_PASSWORD),
    },
    async (request, reply) => {
      const email = (request.body as { email: string }).email
        .trim()
        .toLowerCase();
      const user = await fastify.prisma.user.findUnique({ where: { email } });

      if (user) {
        const { code } = await otp.generate({
          destination: email,
          purpose: "PASSWORD_RESET",
          userId: user.id,
        });
        await sendEmail({
          to: email,
          subject: "Reset your password",
          text: `Your password reset code is ${code}. It expires in 5 minutes.`,
        });
      }

      return reply.send({
        success: true,
        data: {
          message:
            "If an account matches, a password reset code has been sent.",
        },
      });
    },
  );

  // ── POST /password-reset/verify ────────────────────────────────────────────
  // Exchange a valid reset OTP for a short-lived single-use reset token.
  fastify.post(
    "/password-reset/verify",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 hour",
          keyGenerator: (req: FastifyRequest) => {
            const email = (req.body as { email?: string } | undefined)?.email;
            return `reset-verify:${(email ?? req.ip).toLowerCase()}`;
          },
        },
      },
      schema: toFastifySchema(AUTH_CONTRACTS.VERIFY_RESET_OTP),
    },
    async (request, reply) => {
      const { email, otp: code } = request.body as {
        email: string;
        otp: string;
      };

      const result = await otp.verify({
        destination: email,
        purpose: "PASSWORD_RESET",
        code,
      });

      if (!result.ok || !result.userId) {
        throw new ValidationError(
          "Invalid or expired reset code.",
          undefined,
          ErrorCode.OTP_INVALID,
        );
      }

      const { token, expiresAt } = await otp.issueResetToken(result.userId);

      return reply.send({
        success: true,
        data: { resetToken: token, expiresAt: expiresAt.toISOString() },
      });
    },
  );

  // ── POST /password-reset/confirm ───────────────────────────────────────────
  // Consume the reset token, set the new password, and revoke all sessions.
  fastify.post(
    "/password-reset/confirm",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 hour",
          keyGenerator: ipKey("reset-confirm"),
        },
      },
      schema: toFastifySchema(AUTH_CONTRACTS.RESET_PASSWORD),
    },
    async (request, reply) => {
      const { resetToken, newPassword } = request.body as {
        resetToken: string;
        newPassword: string;
      };

      const result = await otp.consumeResetToken(resetToken);
      if (!result.ok) {
        throw new ValidationError(
          "Invalid or expired reset token.",
          undefined,
          ErrorCode.TOKEN_INVALID,
        );
      }

      const hashed = await hashPassword(newPassword);

      // Set password AND revoke every active session for the user in one flow.
      await fastify.prisma.user.update({
        where: { id: result.userId },
        data: {
          password: hashed,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await fastify.prisma.refreshToken.updateMany({
        where: { userId: result.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      fastify.log.info(
        { userId: result.userId },
        "auth.password_reset_completed",
      );

      return reply.send({
        success: true,
        data: { message: "Password reset successfully. Please log in again." },
      });
    },
  );
};

export default recoveryRoutes;
