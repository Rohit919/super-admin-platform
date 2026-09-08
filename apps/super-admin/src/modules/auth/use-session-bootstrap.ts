import { useEffect } from "react";
import { refreshAccessToken } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Silent session bootstrap (Phase 19.2).
 *
 * The access token lives in memory only, so after a hard reload the store has
 * no token even though the user may still hold a valid HTTP-only refresh
 * cookie. On mount we attempt a single silent /auth/refresh: on success the
 * client sets a fresh in-memory access token; either way we flip `bootstrapped`
 * so route guards stop showing the loading state and can make an authoritative
 * authenticated/unauthenticated decision.
 *
 * If a token is already present (e.g. just after login) there is nothing to
 * recover, so we mark bootstrap complete immediately without a network call.
 */
export function useSessionBootstrap(): { bootstrapped: boolean } {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const setBootstrapped = useAuthStore((s) => s.setBootstrapped);

  useEffect(() => {
    if (bootstrapped) return;

    let cancelled = false;
    const hasToken = Boolean(useAuthStore.getState().accessToken);

    if (hasToken) {
      setBootstrapped(true);
      return;
    }

    void (async () => {
      try {
        await refreshAccessToken();
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapped, setBootstrapped]);

  return { bootstrapped };
}
