import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { API_CONTRACTS, type MeResponse } from "@app/api-contracts";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Loads the authenticated user's identity + effective PLATFORM permissions and
 * syncs them into the auth store. Platform permissions come from GET /users/me:
 * the platform role (tenantId null) resolves with no active tenant, so /me's
 * permissions include the platform.* keys for a platform user.
 */
export function usePlatformBootstrap() {
  const setAuthorization = useAuthStore((s) => s.setAuthorization);

  const query = useQuery({
    queryKey: ["platform", "me"],
    queryFn: async () => {
      const res = await apiClient.request<MeResponse>(API_CONTRACTS.USERS.ME);
      return res.data;
    },
  });

  useEffect(() => {
    if (query.data) {
      setAuthorization({
        roles: query.data.roles ?? [],
        permissions: query.data.permissions ?? [],
      });
    }
  }, [query.data, setAuthorization]);

  return query;
}
