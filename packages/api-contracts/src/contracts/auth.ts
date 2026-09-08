import { HttpMethod } from "./http.js";
import type { ApiEndpoint } from "./endpoint.js";
import { AUTH_ENDPOINTS } from "../endpoints/auth.js";
import { ErrorCode } from "../common.js";
import {
  LoginBody,
  RegisterBody,
  RefreshBody,
  LogoutBody,
  AuthResponse,
  TokenPairResponse,
  VerifyResponse,
  LogoutResponse,
} from "../auth.js";
import {
  VerifyEmailBody,
  ResendVerificationBody,
  ForgotPasswordBody,
  VerifyResetOtpBody,
  ResetPasswordBody,
  ChangePasswordBody,
  MessageResponse,
  ResetTokenResponse,
} from "../auth-otp.js";

/**
 * Authentication endpoint contracts (Level 2 — API_CONTRACTS §24, §78).
 * Paths come from the Level 1 registry so both stay in sync. `operationId`s are
 * stable and used for OpenAPI, metrics, tracing, and logs (API_CONTRACTS §117).
 */
export const AUTH_CONTRACTS = {
  REGISTER: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.REGISTER,
    auth: "public",
    body: RegisterBody,
    response: { 201: AuthResponse },
    errors: [
      ErrorCode.VALIDATION_ERROR,
      ErrorCode.CONFLICT,
      ErrorCode.RATE_LIMITED,
    ],
    operationId: "auth.register",
    summary: "Register a new account",
    tags: ["Authentication"],
  },

  LOGIN: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.LOGIN,
    auth: "public",
    body: LoginBody,
    response: { 200: AuthResponse },
    errors: [
      ErrorCode.INVALID_CREDENTIALS,
      ErrorCode.VALIDATION_ERROR,
      ErrorCode.RATE_LIMITED,
    ],
    operationId: "auth.login",
    summary: "Authenticate and receive an access token",
    tags: ["Authentication"],
  },

  REFRESH: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.REFRESH,
    auth: "public",
    body: RefreshBody,
    response: { 200: TokenPairResponse },
    errors: [
      ErrorCode.TOKEN_MISSING,
      ErrorCode.TOKEN_INVALID,
      ErrorCode.TOKEN_EXPIRED,
      ErrorCode.TOKEN_REVOKED,
    ],
    operationId: "auth.refresh",
    summary: "Rotate the refresh cookie and issue a new access token",
    tags: ["Authentication"],
  },

  LOGOUT: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.LOGOUT,
    auth: "public",
    body: LogoutBody,
    response: { 200: LogoutResponse },
    operationId: "auth.logout",
    summary: "Revoke the current session",
    tags: ["Authentication"],
  },

  LOGOUT_ALL: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.LOGOUT_ALL,
    auth: "required",
    body: LogoutBody,
    response: { 200: LogoutResponse },
    errors: [ErrorCode.UNAUTHORIZED],
    operationId: "auth.logoutAll",
    summary: "Revoke all sessions for the authenticated user",
    tags: ["Authentication"],
  },

  VERIFY: {
    method: HttpMethod.GET,
    path: AUTH_ENDPOINTS.VERIFY,
    auth: "required",
    response: { 200: VerifyResponse },
    errors: [ErrorCode.UNAUTHORIZED],
    operationId: "auth.verify",
    summary: "Verify the current access token",
    tags: ["Authentication"],
  },

  CHANGE_PASSWORD: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.CHANGE_PASSWORD,
    auth: "required",
    body: ChangePasswordBody,
    response: { 200: MessageResponse },
    errors: [ErrorCode.UNAUTHORIZED, ErrorCode.VALIDATION_ERROR],
    operationId: "auth.changePassword",
    summary: "Change the authenticated user password",
    tags: ["Authentication"],
  },

  // ── Recovery flow ───────────────────────────────────────────────────────────
  VERIFY_EMAIL: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.VERIFY_EMAIL,
    auth: "public",
    body: VerifyEmailBody,
    response: { 200: MessageResponse },
    errors: [ErrorCode.OTP_INVALID, ErrorCode.VALIDATION_ERROR],
    operationId: "auth.verifyEmail",
    summary: "Verify an email address with an OTP",
    tags: ["Authentication"],
  },

  RESEND_VERIFICATION: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.RESEND_VERIFICATION,
    auth: "public",
    body: ResendVerificationBody,
    response: { 200: MessageResponse },
    errors: [ErrorCode.RATE_LIMITED],
    operationId: "auth.resendVerification",
    summary: "Resend the email-verification OTP",
    tags: ["Authentication"],
  },

  FORGOT_PASSWORD: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.FORGOT_PASSWORD,
    auth: "public",
    body: ForgotPasswordBody,
    response: { 200: MessageResponse },
    errors: [ErrorCode.RATE_LIMITED],
    operationId: "auth.forgotPassword",
    summary: "Request a password-reset OTP",
    tags: ["Authentication"],
  },

  VERIFY_RESET_OTP: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.VERIFY_RESET_OTP,
    auth: "public",
    body: VerifyResetOtpBody,
    response: { 200: ResetTokenResponse },
    errors: [ErrorCode.OTP_INVALID, ErrorCode.VALIDATION_ERROR],
    operationId: "auth.verifyResetOtp",
    summary: "Verify a reset OTP and receive a single-use reset token",
    tags: ["Authentication"],
  },

  RESET_PASSWORD: {
    method: HttpMethod.POST,
    path: AUTH_ENDPOINTS.RESET_PASSWORD,
    auth: "public",
    body: ResetPasswordBody,
    response: { 200: MessageResponse },
    errors: [ErrorCode.TOKEN_INVALID, ErrorCode.VALIDATION_ERROR],
    operationId: "auth.resetPassword",
    summary: "Reset the password using a verified reset token",
    tags: ["Authentication"],
  },
} satisfies Record<string, ApiEndpoint>;
