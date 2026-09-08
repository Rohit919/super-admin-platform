import { apiClient } from "@/lib/api-client";
import {
  API_ENDPOINTS,
  type LoginBody,
  type AuthResponse,
} from "@app/api-contracts";

type LoginData = AuthResponse["data"];

/**
 * Shared authentication. The Super Admin uses the SAME /auth/login as the
 * tenant Admin — authentication is shared, authorization is not. Whether the
 * logged-in user may use the platform is decided by the server (platform
 * membership gate) on the first /platform/* call.
 */
export const authApi = {
  login: (body: LoginBody): Promise<LoginData> =>
    apiClient.post<LoginData>(API_ENDPOINTS.AUTH.LOGIN, body, true),
};
