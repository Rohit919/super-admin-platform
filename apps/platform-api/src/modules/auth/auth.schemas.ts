/**
 * Auth module schemas.
 * Sourced from the shared @app/api-contracts package so the API and the admin
 * frontend validate against the exact same TypeBox definitions.
 */
export {
  LoginBody as LoginBodySchema,
  RegisterBody as RegisterBodySchema,
  RefreshBody as RefreshBodySchema,
  LogoutBody as LogoutBodySchema,
  AuthResponse as AuthResponseSchema,
  TokenPairResponse as TokenPairResponseSchema,
  VerifyResponse as VerifyResponseSchema,
  LogoutResponse as LogoutResponseSchema,
  ErrorEnvelope as ErrorResponseSchema,
  // OTP / password-reset / email-verification
  VerifyEmailBody as VerifyEmailBodySchema,
  ResendVerificationBody as ResendVerificationBodySchema,
  ForgotPasswordBody as ForgotPasswordBodySchema,
  VerifyResetOtpBody as VerifyResetOtpBodySchema,
  ResetPasswordBody as ResetPasswordBodySchema,
  ChangePasswordBody as ChangePasswordBodySchema,
  MessageResponse as MessageResponseSchema,
  ResetTokenResponse as ResetTokenResponseSchema,
} from "@app/api-contracts";
