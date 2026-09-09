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
const tenantOverview = vi.fn();
const tenantOrganization = vi.fn();
const updateTenantOrganization = vi.fn();
const setTenantStatus = vi.fn();
const updateTenant = vi.fn();
const auditLogs = vi.fn();
const listCredentials = vi.fn();
const tenantEntitlements = vi.fn();
const plans = vi.fn();
const assignTenantPlan = vi.fn();
const setTenantEntitlementOverride = vi.fn();

vi.mock("@/modules/platform/platform.api", () => ({
  platformApi: {
    tenant: (id: string) => tenant(id),
    tenantOverview: (id: string) => tenantOverview(id),
    tenantOrganization: (id: string) => tenantOrganization(id),
    updateTenantOrganization: (id: string, body: unknown) =>
      updateTenantOrganization(id, body),
    setTenantStatus: (id: string, status: string) =>
      setTenantStatus(id, status),
    updateTenant: (id: string, body: unknown) => updateTenant(id, body),
    auditLogs: (q: unknown) => auditLogs(q),
    listCredentials: (id: string) => listCredentials(id),
    tenantEntitlements: (id: string) => tenantEntitlements(id),
    plans: () => plans(),
    assignTenantPlan: (id: string, planKey: string) =>
      assignTenantPlan(id, planKey),
    setTenantEntitlementOverride: (
      id: string,
      key: string,
      value: string | null,
    ) => setTenantEntitlementOverride(id, key, value),
  },
}));

const OVERVIEW = {
  id: "t1",
  name: "Acme Co",
  slug: "acme",
  status: "ACTIVE",
  createdAt: new Date("2026-01-01").toISOString(),
  updatedAt: new Date("2026-01-02").toISOString(),
  primaryAdmin: {
    id: "u1",
    name: "Ada Admin",
    email: "ada@acme.co",
    since: new Date("2026-01-01").toISOString(),
  },
  members: { total: 3, active: 3, invited: 0, suspended: 0 },
  credentials: { total: 2, active: 1, revoked: 1, expired: 0 },
  plan: {
    key: "growth",
    name: "Growth",
    assignedAt: new Date("2026-01-01").toISOString(),
    entitlementCount: 4,
    overrideCount: 1,
  },
};

const ORGANIZATION = {
  id: "t1",
  name: "Acme Co",
  slug: "acme",
  legalName: "Acme Logistics, Inc.",
  website: "https://acme.co",
  industry: "Logistics",
  description: null,
  timeZone: "Africa/Lagos",
  locale: "en-US",
  addressLine1: "1 Market St",
  addressLine2: null,
  city: "Lagos",
  region: "LA",
  postalCode: "100001",
  country: "NG",
  contactName: "Ada Ops",
  contactEmail: "ops@acme.co",
  contactPhone: "+234 800 0000",
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
    tenantOverview.mockReset();
    tenantOrganization.mockReset();
    updateTenantOrganization.mockReset();
    setTenantStatus.mockReset();
    updateTenant.mockReset();
    auditLogs.mockReset();
    listCredentials.mockReset();
    tenantEntitlements.mockReset();
    plans.mockReset();
    assignTenantPlan.mockReset();
    setTenantEntitlementOverride.mockReset();
    tenantOverview.mockResolvedValue(OVERVIEW);
    // Full platform permissions so all actions/panels are visible (UX gate).
    useAuthStore.getState().setAuthorization({
      roles: ["SUPER_ADMIN"],
      permissions: [
        "platform.tenant.suspend",
        "platform.tenant.archive",
        "platform.tenant.update",
        "platform.audit.view",
        "platform.credential.read",
        "platform.entitlement.view",
        "platform.entitlement.manage",
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
    tenantOrganization.mockResolvedValue(ORGANIZATION);
  });

  it("requires confirmation before archiving and does not call the API until confirmed", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    setTenantStatus.mockResolvedValue({ ...ACTIVE_TENANT, status: "ARCHIVED" });

    renderDetail();

    // Open the Archive action from the Overview lifecycle card → no API call
    // yet, a confirmation dialog appears (with a type-to-confirm gate).
    fireEvent.click(await screen.findByLabelText("Archive tenant"));

    expect(setTenantStatus).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/permanent and cannot be undone/i),
    ).toBeInTheDocument();

    // High-impact: must type the tenant name to enable the confirm button.
    const confirmBtn = screen.getByRole("button", { name: /Confirm Archive/i });
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(
      screen.getByLabelText(/type the tenant name to confirm/i),
      {
        target: { value: ACTIVE_TENANT.name },
      },
    );

    // Confirm → API is called with ARCHIVED.
    fireEvent.click(screen.getByRole("button", { name: /Confirm Archive/i }));
    await waitFor(() =>
      expect(setTenantStatus).toHaveBeenCalledWith("t1", "ARCHIVED"),
    );
  });

  it("cancelling a transition does not call the API", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);

    renderDetail();

    fireEvent.click(await screen.findByLabelText("Suspend tenant"));
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

    // Audit lives under the Audit tab in the control-center layout.
    fireEvent.click(await screen.findByRole("tab", { name: /Audit/i }));

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

    // The effective entitlement table lives under the Entitlements tab.
    fireEvent.click(await screen.findByRole("tab", { name: /Entitlements/i }));

    expect(await screen.findByText("Plan & Entitlements")).toBeInTheDocument();
    expect(await screen.findByText("Maximum users")).toBeInTheDocument();
    expect(await screen.findByText("OVERRIDE")).toBeInTheDocument();
  });

  it("edits the tenant name via the Edit form (platform.tenant.update)", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    updateTenant.mockResolvedValue({ ...ACTIVE_TENANT, name: "Acme Renamed" });

    renderDetail();

    // Open the edit form from the Overview card.
    fireEvent.click(await screen.findByRole("button", { name: /^Edit$/ }));
    const input = await screen.findByLabelText(/Tenant name/i);
    fireEvent.change(input, { target: { value: "Acme Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() =>
      expect(updateTenant).toHaveBeenCalledWith("t1", { name: "Acme Renamed" }),
    );
  });

  it("hides the Edit button without platform.tenant.update", async () => {
    useAuthStore.getState().setAuthorization({
      roles: [],
      permissions: ["platform.audit.view"],
    });
    tenant.mockResolvedValue(ACTIVE_TENANT);

    renderDetail();
    await screen.findByText("Overview");
    expect(
      screen.queryByRole("button", { name: /^Edit$/ }),
    ).not.toBeInTheDocument();
  });

  it("sets an entitlement override (platform.entitlement.manage)", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    tenantEntitlements.mockResolvedValue({
      tenantId: "t1",
      plan: { key: "growth", name: "Growth" },
      entitlements: [
        {
          key: "max_users",
          name: "Maximum users",
          valueType: "NUMERIC",
          value: "5",
          source: "PLAN",
        },
      ],
    });
    setTenantEntitlementOverride.mockResolvedValue({
      tenantId: "t1",
      plan: { key: "growth", name: "Growth" },
      entitlements: [],
    });

    renderDetail();

    // The override editor lives under the Entitlements tab.
    fireEvent.click(await screen.findByRole("tab", { name: /Entitlements/i }));

    // The override editor input appears when the user can manage entitlements.
    const overrideInput = await screen.findByLabelText(
      /Override value for Maximum users/i,
    );
    fireEvent.change(overrideInput, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: /^Set$/ }));

    await waitFor(() =>
      expect(setTenantEntitlementOverride).toHaveBeenCalledWith(
        "t1",
        "max_users",
        "25",
      ),
    );
  });

  it("renders the header, status badge and summary cards", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    renderDetail();

    // Name appears in the header; slug and a status badge are present.
    expect(
      await screen.findByRole("heading", { name: "Acme Co" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("ACTIVE").length).toBeGreaterThan(0);
    // Summary metrics label section headings (present at least once each).
    expect(screen.getAllByText("Members").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Created").length).toBeGreaterThan(0);
    // "Organization" now labels both the tab and the Overview org card.
    expect(screen.getAllByText("Organization").length).toBeGreaterThan(0);
  });

  it("shows the primary administrator from the real overview aggregate", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    renderDetail();

    // Primary admin's name + email appear (header summary stat + Overview
    // identity row both surface the real aggregate).
    expect((await screen.findAllByText("Ada Admin")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ada@acme.co").length).toBeGreaterThan(0);
    expect(tenantOverview).toHaveBeenCalledWith("t1");
  });

  it("renders the Lifecycle tab with a state machine and audit-derived history", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    auditLogs.mockResolvedValue([
      {
        id: "a1",
        action: "TENANT_SUSPENDED",
        tenantId: "t1",
        actorId: "u1",
        targetType: "TENANT",
        targetId: "t1",
        metadata: { from: "ACTIVE", to: "SUSPENDED" },
        requestId: "req_1",
        createdAt: new Date("2026-01-03").toISOString(),
      },
    ]);

    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: /Lifecycle/i }));

    expect(await screen.findByText("Transition history")).toBeInTheDocument();
    // The audit-derived transition renders with a from → to summary.
    expect(await screen.findByText(/ACTIVE → SUSPENDED/)).toBeInTheDocument();
    // The provisioning capability gap note is honest, not fabricated depth.
    expect(
      screen.getByText(/Provisioning is single-step/i),
    ).toBeInTheDocument();
  });

  it("renders the Security tab from real signals with an honest gap note", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    renderDetail();

    fireEvent.click(await screen.findByRole("tab", { name: /Security/i }));

    expect(await screen.findByText("Security posture")).toBeInTheDocument();
    // Real derived signal: active platform access for an ACTIVE tenant.
    expect(screen.getAllByText(/Active/i).length).toBeGreaterThan(0);
    // No fabricated auth-event feed — documented as a gap.
    expect(screen.getByText(/not tenant-scoped yet/i)).toBeInTheDocument();
  });

  it("navigates to the Credentials tab and shows its empty state", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    listCredentials.mockResolvedValue([]);
    renderDetail();

    fireEvent.click(await screen.findByRole("tab", { name: /Credentials/i }));

    expect(await screen.findByText("API Credentials")).toBeInTheDocument();
    expect(await screen.findByText("No credentials yet")).toBeInTheDocument();
  });

  it("hides permission-gated tabs when the user lacks access", async () => {
    // Only tenant.update → Overview visible, but no Plan/Credentials/Audit tabs.
    useAuthStore.getState().setAuthorization({
      roles: [],
      permissions: ["platform.tenant.update"],
    });
    tenant.mockResolvedValue(ACTIVE_TENANT);
    renderDetail();

    await screen.findByRole("tab", { name: /Overview/i });
    expect(
      screen.queryByRole("tab", { name: /Plan/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /Credentials/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /Audit/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the Organization tab with real profile data (read-only)", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    renderDetail();

    fireEvent.click(await screen.findByRole("tab", { name: /Organization/i }));

    expect(await screen.findByText("Organization profile")).toBeInTheDocument();
    expect(await screen.findByText("Acme Logistics, Inc.")).toBeInTheDocument();
    expect(screen.getByText("Ada Ops")).toBeInTheDocument();
    expect(screen.getByText("ops@acme.co")).toBeInTheDocument();
    expect(tenantOrganization).toHaveBeenCalledWith("t1");
  });

  it("shows 'Not provided' for empty organization fields (honest empty state)", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    // A profile with a legal name but no address/contact — empties must render.
    tenantOrganization.mockResolvedValue({
      ...ORGANIZATION,
      addressLine1: null,
      city: null,
      country: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
    });

    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: /Organization/i }));

    // Section headings are always shown, and empty fields read "Not provided".
    expect(await screen.findByText("Registered address")).toBeInTheDocument();
    expect(screen.getByText("Business contact")).toBeInTheDocument();
    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0);
  });

  it("edits the organization profile and sends only changed fields", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    updateTenantOrganization.mockResolvedValue({
      ...ORGANIZATION,
      legalName: "Acme Global Ltd",
    });

    renderDetail();

    fireEvent.click(await screen.findByRole("tab", { name: /Organization/i }));
    // Enter edit mode.
    fireEvent.click(
      await screen.findByRole("button", { name: /Edit organization/i }),
    );

    const legal = await screen.findByLabelText(/Legal name/i);
    fireEvent.change(legal, { target: { value: "Acme Global Ltd" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() =>
      expect(updateTenantOrganization).toHaveBeenCalledWith("t1", {
        legalName: "Acme Global Ltd",
      }),
    );
  });

  it("hides the Organization Edit button without platform.tenant.update", async () => {
    useAuthStore.getState().setAuthorization({
      roles: [],
      permissions: ["platform.audit.view"],
    });
    tenant.mockResolvedValue(ACTIVE_TENANT);

    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: /Organization/i }));

    expect(await screen.findByText("Organization profile")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Edit organization/i }),
    ).not.toBeInTheDocument();
  });

  it("blocks saving an invalid website in the Organization form", async () => {
    tenant.mockResolvedValue(ACTIVE_TENANT);
    renderDetail();

    fireEvent.click(await screen.findByRole("tab", { name: /Organization/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Edit organization/i }),
    );

    const website = await screen.findByLabelText(/Website/i);
    fireEvent.change(website, { target: { value: "notaurl" } });

    // Client validation surfaces an error and disables save; no API call.
    expect(
      await screen.findByText(/Must start with http/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Save changes/i }),
    ).toBeDisabled();
    expect(updateTenantOrganization).not.toHaveBeenCalled();
  });

  it("loads the correct tenant's organization (cross-tenant isolation)", async () => {
    // Render the detail page for a DIFFERENT tenant (t2) and confirm the
    // Organization query is scoped to that tenant id — never t1's cached data.
    const TENANT_2 = {
      ...ACTIVE_TENANT,
      id: "t2",
      name: "Beta Co",
      slug: "beta",
    };
    tenant.mockImplementation((id: string) =>
      Promise.resolve(id === "t2" ? TENANT_2 : ACTIVE_TENANT),
    );
    tenantOverview.mockImplementation((id: string) =>
      Promise.resolve({
        ...OVERVIEW,
        id,
        name: id === "t2" ? "Beta Co" : "Acme Co",
      }),
    );
    tenantOrganization.mockImplementation((id: string) =>
      Promise.resolve({
        ...ORGANIZATION,
        id,
        name: id === "t2" ? "Beta Co" : "Acme Co",
        legalName: id === "t2" ? "Beta Logistics Ltd" : "Acme Logistics, Inc.",
      }),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/tenants/t2"]}>
          <Routes>
            <Route path="/tenants/:id" element={<TenantDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: /Organization/i }));

    expect(await screen.findByText("Beta Logistics Ltd")).toBeInTheDocument();
    expect(screen.queryByText("Acme Logistics, Inc.")).not.toBeInTheDocument();
    expect(tenantOrganization).toHaveBeenCalledWith("t2");
    expect(tenantOrganization).not.toHaveBeenCalledWith("t1");
  });
});
