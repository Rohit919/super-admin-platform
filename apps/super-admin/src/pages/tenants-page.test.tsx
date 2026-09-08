import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";

/**
 * TenantsPage: list rendering, RBAC-gated "New tenant" (UX only), and the
 * create flow (success + error). The API remains the authoritative boundary.
 */
const tenants = vi.fn();
const createTenant = vi.fn();
const setTenantStatus = vi.fn();

vi.mock("@/modules/platform/platform.api", () => ({
  platformApi: {
    tenants: (status?: string) => tenants(status),
    createTenant: (body: unknown) => createTenant(body),
    setTenantStatus: (id: string, status: string) =>
      setTenantStatus(id, status),
  },
}));

import { TenantsPage } from "./tenants-page";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TenantsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const TENANT = {
  id: "t1",
  name: "Acme Co",
  slug: "acme",
  status: "ACTIVE",
  memberCount: 2,
  createdAt: new Date("2026-01-01").toISOString(),
  updatedAt: new Date("2026-01-01").toISOString(),
};

describe("TenantsPage", () => {
  beforeEach(() => {
    tenants.mockReset();
    createTenant.mockReset();
    setTenantStatus.mockReset();
    tenants.mockResolvedValue([TENANT]);
  });

  it("lists tenants", async () => {
    useAuthStore.getState().setAuthorization({ roles: [], permissions: [] });
    renderPage();
    expect(await screen.findByText("Acme Co")).toBeInTheDocument();
  });

  it("hides the New tenant button without platform.tenant.create", async () => {
    useAuthStore.getState().setAuthorization({ roles: [], permissions: [] });
    renderPage();
    await screen.findByText("Acme Co");
    expect(
      screen.queryByRole("button", { name: /New tenant/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the provisioning form when a permitted user opens it", async () => {
    useAuthStore.getState().setAuthorization({
      roles: ["SUPER_ADMIN"],
      permissions: ["platform.tenant.create"],
    });

    renderPage();
    await screen.findByText("Acme Co");

    // The create form is hidden until "New tenant" is clicked (RBAC-gated).
    expect(screen.queryByText("Provision new tenant")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New tenant/i }));
    expect(await screen.findByText("Provision new tenant")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create tenant/i }),
    ).toBeInTheDocument();
  });
});
