import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";

// The layout bootstraps the platform user via a network query; stub it so the
// test focuses on permission-aware nav rendering (UX only).
vi.mock("@/modules/auth/use-platform-bootstrap", () => ({
  usePlatformBootstrap: () => ({ data: undefined, isPending: false }),
}));

import { PlatformLayout } from "./platform-layout";

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<PlatformLayout />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PlatformLayout — permission-aware navigation", () => {
  beforeEach(() => useAuthStore.getState().clearSession());

  it("shows only nav items the user has permission for", () => {
    // Dashboard + Tenants permissions, but NOT users/audit.
    useAuthStore.getState().setAuthorization({
      roles: ["OPERATOR"],
      permissions: ["platform.dashboard.view", "platform.tenant.view"],
    });

    renderLayout();

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Tenants")).toBeInTheDocument();
    // No permission → hidden (UX only; API still enforces).
    expect(screen.queryByText("Platform Users")).not.toBeInTheDocument();
    expect(screen.queryByText("Audit Logs")).not.toBeInTheDocument();
  });

  it("shows Audit Logs when the user holds platform.audit.view", () => {
    useAuthStore.getState().setAuthorization({
      roles: ["SUPER_ADMIN"],
      permissions: [
        "platform.dashboard.view",
        "platform.tenant.view",
        "platform.user.view",
        "platform.audit.view",
      ],
    });

    renderLayout();

    expect(screen.getByText("Audit Logs")).toBeInTheDocument();
    expect(screen.getByText("Platform Users")).toBeInTheDocument();
  });
});
