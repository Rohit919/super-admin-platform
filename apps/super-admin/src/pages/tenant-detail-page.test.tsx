import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";

/**
 * TenantDetailPage lifecycle tests: high-risk status transitions require an
 * explicit confirmation before the API is called, and the tenant-scoped audit
 * panel renders from the existing audit endpoint.
 */
const tenant = vi.fn();
const setTenantStatus = vi.fn();
const auditLogs = vi.fn();
const listCredentials = vi.fn();
const tenantEntitlements = vi.fn();
const plans = vi.fn();
const assignTenantPlan = vi.fn();

vi.mock("@/modules/platform/platform.api", () => ({
  platformApi: {
    tenant: (id: string) => tenant(id),
    setTenantStatus: (id: string, status: string) =>
      setTenantStatus(id, status),
    auditLogs: (q: unknown) => auditLogs(q),
    listCredentials: (id: string) => listCredentials(id),
    tenantEntitlements: (id: string) => tenantEntitlements(id),
    plans: () => plans(),
    assignTenantPlan: (id: string, planKey: string) =>
      assignTenantPlan(id, planKey),
  },
}));

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

const ACTIVE_TENANT = {
  id: "t1",
  name: "Acme Co",
  slug: "acme",
  status: "ACTIVE",
  memberCount: 3,
  createdAt: new Date("2026-01-01").toISOString(),
  updatedAt: new Date("2026-01-02").toISOString(),
};

describe("TenantDetailPage lifecycle", () => {
  beforeEach(() => {
    tenant.mockReset();
    setTenantStatus.mockReset();
    auditLogs.mockReset();
    listCredentials.mockReset();
    tenantEntitlements.mockReset();
    plans.mockReset();
    assignTenantPlan.mockReset();
    // Full platform permissions so all actions/panels are visible (UX gate).
    useAuthStore.getState().setAuthorization({
      roles: ["SUPER_ADMIN"],
      permissions: [
        "platform.tenant.suspend",
        "platform.tenant.archive",
        "platform.audit.view",
        "platform.credential.read",
        "platform.entitlement.view",
        "platform.plan.manage",
      ],
    });
    auditLogs.mockResolvedValue([]);
    listCredentials.mockResolvedValue([]);
    tenantEntitlements.mockResolvedValue({
      tenantId: "t1",
      plan: null,
      entitlements: [],
    });
    plans.mockResolvedValue([]);
  });

  it("requires confirmation before archiving and does not call the API until confirmed", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    setTenantStatus.mockResolvedValue({ ...ACTIVE_TENANT, status: "ARCHIVED" });

    renderDetail();

    // Click Archive → no API call yet, a confirm prompt appears.
    const archiveBtn = await screen.findByRole("button", { name: "Archive" });
    fireEvent.click(archiveBtn);

    expect(setTenantStatus).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/permanent and cannot be undone/i),
    ).toBeInTheDocument();

    // Confirm → API is called with ARCHIVED.
    fireEvent.click(screen.getByRole("button", { name: /Confirm Archive/i }));
    await waitFor(() =>
      expect(setTenantStatus).toHaveBeenCalledWith("t1", "ARCHIVED"),
    );
  });

  it("cancelling a transition does not call the API", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);

    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Suspend" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(setTenantStatus).not.toHaveBeenCalled();
  });

  it("renders the tenant-scoped audit panel", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    auditLogs.mockResolvedValue([
      {
        id: "a1",
        action: "tenant.suspended",
        tenantId: "t1",
        actorId: "u1",
        targetType: "TENANT",
        targetId: "t1",
        metadata: null,
        requestId: null,
        createdAt: new Date("2026-01-03").toISOString(),
      },
    ]);

    renderDetail();

    expect(await screen.findByText("Lifecycle & Audit")).toBeInTheDocument();
    expect(await screen.findByText("tenant.suspended")).toBeInTheDocument();
    expect(auditLogs).toHaveBeenCalledWith({ tenantId: "t1", limit: 20 });
  });

  it("renders the plan & entitlements panel with effective values and source", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    tenantEntitlements.mockResolvedValue({
      tenantId: "t1",
      plan: { key: "growth", name: "Growth" },
      entitlements: [
        {
          key: "max_users",
          name: "Maximum users",
          valueType: "NUMERIC",
          value: "25",
          source: "OVERRIDE",
        },
      ],
    });

    renderDetail();

    expect(await screen.findByText("Plan & Entitlements")).toBeInTheDocument();
    expect(await screen.findByText("Maximum users")).toBeInTheDocument();
    expect(await screen.findByText("OVERRIDE")).toBeInTheDocument();
  });
});
