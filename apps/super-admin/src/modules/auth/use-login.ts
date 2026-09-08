import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/modules/auth/auth.api";
import { useAuthStore } from "@/stores/auth.store";
import type { LoginBody } from "@app/api-contracts";

/**
 * Platform login. On success stores the session and navigates to the dashboard.
 * The dashboard (and every /platform/* call) is the authoritative access check:
 * a non-platform user logs in but is refused there with PLATFORM_ACCESS_DENIED.
 */
export function useLogin() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const setBootstrapped = useAuthStore((s) => s.setBootstrapped);

  return useMutation({
    mutationFn: (body: LoginBody) => authApi.login(body),
    onSuccess: (data) => {
      setSession({ accessToken: data.accessToken, user: data.user });
      // We have a fresh in-memory token; no silent refresh needed on arrival.
      setBootstrapped(true);
      navigate("/dashboard", { replace: true });
    },
  });
}
