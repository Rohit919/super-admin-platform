import { API_VERSION } from "./common.js";

/**
 * Authentication endpoint paths. Mirrors the routes registered under
 * `/api/v1/auth` (auth.routes.ts + auth-recovery.routes.ts).
 */
const AUTH_BASE = `${API_VERSION}/auth`;

export const AUTH_ENDPOINTS = {
  REGISTER: `${AUTH_BASE}/register`,
  LOGIN: `${AUTH_BASE}/login`,
  LOGOUT: `${AUTH_BASE}/logout`,
  LOGOUT_ALL: `${AUTH_BASE}/logout-all`,
  REFRESH: `${AUTH_BASE}/refresh`,
  VERIFY: `${AUTH_BASE}/verify`,
  CHANGE_PASSWORD: `${AUTH_BASE}/change-password`,

  // Email verification
  VERIFY_EMAIL: `${AUTH_BASE}/verify-email`,
  RESEND_VERIFICATION: `${AUTH_BASE}/resend-verification`,

  // Password recovery (OTP flow)
  FORGOT_PASSWORD: `${AUTH_BASE}/forgot-password`,
  VERIFY_RESET_OTP: `${AUTH_BASE}/password-reset/verify`,
  RESET_PASSWORD: `${AUTH_BASE}/password-reset/confirm`,
} as const;
