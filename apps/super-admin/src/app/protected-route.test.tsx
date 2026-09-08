import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./protected-route";
import { useAuthStore } from "@/stores/auth.store";

/**
 * ProtectedRoute is a UX gate (token presence). It must redirect anonymous users
 * to /login and render the protected outlet when authenticated. The API remains
 * the real authorization boundary regardless.
 *
 * Uses the declarative MemoryRouter (not a data router) to avoid jsdom fetch.
 */
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
  beforeEach(() => useAuthStore.getState().clearSession());

  it("redirects an unauthenticated user to /login", () => {
    renderAt("/dashboard");
    expect(screen.getByText("login screen")).toBeInTheDocument();
    expect(screen.queryByText("protected dashboard")).not.toBeInTheDocument();
  });

  it("renders the protected outlet when authenticated", () => {
    useAuthStore.getState().setSession({
      accessToken: "tok",
      user: { id: "u1", email: "a@b.io", name: "A", role: "user" },
    });
    renderAt("/dashboard");
    expect(screen.getByText("protected dashboard")).toBeInTheDocument();
    expect(screen.queryByText("login screen")).not.toBeInTheDocument();
  });
});
