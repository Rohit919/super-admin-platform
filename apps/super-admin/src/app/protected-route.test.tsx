import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./protected-route";
import { useAuthStore } from "@/stores/auth.store";

/**
 * ProtectedRoute is a UX gate (token presence). It must redirect anonymous users
 * to /login and render the protected outlet when authenticated. The API remains
 * the real authorization boundary regardless.
 *
 * Phase 19.2: the access token is memory-only, so on load ProtectedRoute runs a
 * silent /auth/refresh before deciding. We mock that refresh so the tests don't
 * touch the network: "no session" resolves to a failed refresh (stays
 * unauthenticated), and an in-memory token short-circuits the refresh entirely.
 *
 * Uses the declarative MemoryRouter (not a data router) to avoid jsdom fetch.
 */
vi.mock("@/lib/api-client", () => ({
  // Default: no recoverable session — silent refresh fails.
  refreshAccessToken: vi.fn(async () => false),
}));

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>protected dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>login screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
    useAuthStore.getState().setBootstrapped(false);
  });

  it("redirects an unauthenticated user to /login after silent refresh fails", async () => {
    renderAt("/dashboard");
    // Bootstrap runs a silent refresh (mocked to fail); once it settles the
    // guard makes its authoritative decision and redirects.
    expect(await screen.findByText("login screen")).toBeInTheDocument();
    expect(screen.queryByText("protected dashboard")).not.toBeInTheDocument();
  });

  it("renders the protected outlet when an in-memory token is present", async () => {
    useAuthStore.getState().setSession({
      accessToken: "tok",
      user: { id: "u1", email: "a@b.io", name: "A", role: "user" },
    });
    renderAt("/dashboard");
    // A present token short-circuits bootstrap (no refresh needed).
    expect(await screen.findByText("protected dashboard")).toBeInTheDocument();
    expect(screen.queryByText("login screen")).not.toBeInTheDocument();
  });
});
