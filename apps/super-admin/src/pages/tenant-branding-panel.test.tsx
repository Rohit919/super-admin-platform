import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Tenant Control Center Branding panel tests (Phase 21).
 *
 * Verifies the panel reads branding through the central API service, renders a
 * connection status, and submits ONLY changed fields as a partial update. All
 * calls go through platformApi (never the Tenant API directly).
 */
const tenant = vi.fn();
const tenantOverview = vi.fn();
const tenantBranding = vi.fn();
const updateTenantBranding = vi.fn();
const tenantConnection = vi.fn();

vi.mock("@/modules/platform/platform.api", () => ({
  platformApi: {
    tenant: (id: string) => tenant(id),
    tenantOverview: (id: string) => tenantOverview(id),
    tenantBranding: (id: string) => tenantBranding(id),
    updateTenantBranding: (id: string, body: unknown) =>
      updateTenantBranding(id, body),
    tenantConnection: (id: string) => tenantConnection(id),
  },
}));

const TENANT = {
  id: "t1",
  name: "Acme Co",
  slug: "acme",
  status: "ACTIVE",
  createdAt: new Date("2026-01-01").toISOString(),
  updatedAt: new Date("2026-01-02").toISOString(),
};

const BRANDING = {
  appName: "Acme Logistics",
  shortName: "Acme",
  colors: { primary: "#2563EB" },
};

import { TenantDetailPage } from "./tenant-detail-page";

function renderDetail() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tenants/t1"]}>
        <Routes>
          <Route path="/tenants/:id" element={<TenantDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Tenant branding panel", () => {
  beforeEach(() => {
    tenant.mockReset();
    tenantOverview.mockReset();
    tenantBranding.mockReset();
    updateTenantBranding.mockReset();
    tenantConnection.mockReset();

    tenant.mockResolvedValue(TENANT);
    tenantOverview.mockResolvedValue({
      ...TENANT,
      primaryAdmin: null,
      members: { total: 0, active: 0, invited: 0, suspended: 0 },
      credentials: { total: 0, active: 0, revoked: 0, expired: 0 },
      plan: null,
    });
    tenantBranding.mockResolvedValue(BRANDING);
    tenantConnection.mockResolvedValue({
      tenantId: "t1",
      reachable: true,
      status: "ready",
      environment: "production",
      version: "1.0.0",
    });

    useAuthStore.getState().setAuthorization({
      roles: ["SUPER_ADMIN"],
      permissions: ["platform.tenant.view", "platform.tenant.update"],
    });
  });

  it("shows persisted branding and reachable connection status", async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: /Branding/i }));

    expect(await screen.findByText("Acme Logistics")).toBeInTheDocument();
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(tenantBranding).toHaveBeenCalledWith("t1");
    expect(tenantConnection).toHaveBeenCalledWith("t1");
  });

  it("submits ONLY changed fields as a partial update", async () => {
    updateTenantBranding.mockResolvedValue({ ...BRANDING, appName: "Renamed" });
    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: /Branding/i }));

    fireEvent.click(
      await screen.findByRole("button", { name: /Edit branding/i }),
    );

    const appName = await screen.findByLabelText(/App name/i);
    fireEvent.change(appName, { target: { value: "Renamed" } });

    fireEvent.click(screen.getByRole("button", { name: /Save branding/i }));

    await waitFor(() => expect(updateTenantBranding).toHaveBeenCalledTimes(1));
    const [id, body] = updateTenantBranding.mock.calls[0];
    expect(id).toBe("t1");
    // Only appName changed → the partial body carries only appName.
    expect(body).toEqual({ appName: "Renamed" });
  });

  it("hides the edit action without platform.tenant.update", async () => {
    useAuthStore.getState().setAuthorization({
      roles: [],
      permissions: ["platform.tenant.view"],
    });
    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: /Branding/i }));

    await screen.findByText("Acme Logistics");
    expect(
      screen.queryByRole("button", { name: /Edit branding/i }),
    ).not.toBeInTheDocument();
  });
});
