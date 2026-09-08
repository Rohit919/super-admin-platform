import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

/**
 * App-wide providers for the Super Admin app. Minimal by design: just TanStack
 * Query. Platform auth state lives in a Zustand store (no provider needed).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
