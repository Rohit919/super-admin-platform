import { Type, type Static } from "@sinclair/typebox";

/**
 * OTP / password-reset / email-verification contracts.
 * Shared between the Fastify API and the React admin so both validate against
 * the exact same shapes.
 *
 * Design notes:
 * - OTP codes are 6 numeric digits.
 * - Responses are deliberately generic to avoid account enumeration:
 *   forgot-password and resend-verification never reveal whether an account exists.
 */

const EMAIL = Type.String({ format: "email", maxLength: 254 });
const OTP = Type.String({ minLength: 6, maxLength: 6, pattern: "^[0-9]{6}$" });
const PASSWORD = Type.String({ minLength: 8, maxLength: 128 });

// ── Email verification ──────────────────────────────────────────────────────
export const VerifyEmailBody = Type.Object({
  email: EMAIL,
  otp: OTP,
});
export type VerifyEmailBody = Static<typeof VerifyEmailBody>;

export const ResendVerificationBody = Type.Object({
  email: EMAIL,
});
export type ResendVerificationBody = Static<typeof ResendVerificationBody>;

// ── Forgot / reset password ───────────────────────────────────────────────────
export const ForgotPasswordBody = Type.Object({
  email: EMAIL,
});
export type ForgotPasswordBody = Static<typeof ForgotPasswordBody>;

export const VerifyResetOtpBody = Type.Object({
  email: EMAIL,
  otp: OTP,
});
export type VerifyResetOtpBody = Static<typeof VerifyResetOtpBody>;

export const ResetPasswordBody = Type.Object({
  resetToken: Type.String({ minLength: 1, maxLength: 256 }),
  newPassword: PASSWORD,
});
export type ResetPasswordBody = Static<typeof ResetPasswordBody>;

// ── Authenticated password change ─────────────────────────────────────────────
export const ChangePasswordBody = Type.Object({
  currentPassword: PASSWORD,
  newPassword: PASSWORD,
});
export type ChangePasswordBody = Static<typeof ChangePasswordBody>;

// ── Responses ─────────────────────────────────────────────────────────────────

/** Generic message response — reused by all OTP/reset endpoints. */
export const MessageResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Object({ message: Type.String() }),
});
export type MessageResponse = Static<typeof MessageResponse>;

/** Returned after a reset OTP is verified — carries the single-use reset token. */
export const ResetTokenResponse = Type.Object({
  success: Type.Literal(true),
  data: Type.Object({
    resetToken: Type.String(),
    expiresAt: Type.String(),
  }),
});
export type ResetTokenResponse = Static<typeof ResetTokenResponse>;
