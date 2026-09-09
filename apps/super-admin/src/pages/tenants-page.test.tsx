import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
const tenantOverview = vi.fn();

vi.mock("@/modules/platform/platform.api", () => ({
  platformApi: {
    tenants: (query?: unknown) => tenants(query),
    createTenant: (body: unknown) => createTenant(body),
    setTenantStatus: (id: string, status: string) =>
      setTenantStatus(id, status),
    tenantOverview: (id: string) => tenantOverview(id),
  },
}));

/** Build a paginated tenant page envelope (the shape the API service returns). */
function page(
  rows: Array<typeof TENANT>,
  meta: Partial<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> = {},
) {
  return {
    data: rows,
    meta: {
      page: 1,
      pageSize: 25,
      total: rows.length,
      totalPages: 1,
      ...meta,
    },
  };
}

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
    tenantOverview.mockReset();
    tenants.mockResolvedValue(page([TENANT]));
    // Row aggregate cells (plan + credentials) fetch the real overview lazily.
    tenantOverview.mockResolvedValue({
      id: "t1",
      name: "Acme Co",
      slug: "acme",
      status: "ACTIVE",
      createdAt: new Date("2026-01-01").toISOString(),
      updatedAt: new Date("2026-01-01").toISOString(),
      primaryAdmin: null,
      members: { total: 2, active: 2, invited: 0, suspended: 0 },
      credentials: { total: 1, active: 1, revoked: 0, expired: 0 },
      plan: {
        key: "growth",
        name: "Growth",
        assignedAt: new Date("2026-01-01").toISOString(),
        entitlementCount: 4,
        overrideCount: 0,
      },
    });
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

  it("renders a search box and passes the term to the API (debounced)", async () => {
    useAuthStore.getState().setAuthorization({ roles: [], permissions: [] });
    renderPage();
    await screen.findByText("Acme Co");

    const box = screen.getByLabelText(/Search tenants by name or slug/i);
    fireEvent.change(box, { target: { value: "acme" } });

    // Debounced (300ms) — the query eventually fires with the search term.
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(tenants).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "acme", page: 1 }),
    );
  });

  it("shows the pager and advances the page", async () => {
    // Two pages of results so Next is enabled.
    tenants.mockResolvedValue(
      page([TENANT], { total: 30, totalPages: 2, page: 1 }),
    );
    useAuthStore.getState().setAuthorization({ roles: [], permissions: [] });
    renderPage();
    await screen.findByText("Acme Co");

    expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
    const next = screen.getByRole("button", { name: /Next/i });
    fireEvent.click(next);

    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(tenants).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );
  });

  it("shows the empty state (no tenants, no filters)", async () => {
    tenants.mockResolvedValue(page([], { total: 0, totalPages: 0 }));
    useAuthStore
      .getState()
      .setAuthorization({ roles: [], permissions: ["platform.tenant.create"] });
    renderPage();

    expect(await screen.findByText("No tenants yet")).toBeInTheDocument();
  });

  it("shows a no-results state and can clear filters", async () => {
    tenants.mockResolvedValue(page([], { total: 0, totalPages: 0 }));
    useAuthStore.getState().setAuthorization({ roles: [], permissions: [] });
    renderPage();

    // Enter a search term so the "filtered" empty state renders.
    fireEvent.change(
      await screen.findByLabelText(/Search tenants by name or slug/i),
      { target: { value: "zzz" } },
    );
    await act(() => new Promise((r) => setTimeout(r, 400)));

    expect(await screen.findByText("No tenants found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/i }));
    // Clearing resets the search input.
    expect(
      (
        screen.getByLabelText(
          /Search tenants by name or slug/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("");
  });

  it("shows an error state when the list fails to load", async () => {
    tenants.mockRejectedValue(new Error("boom"));
    useAuthStore.getState().setAuthorization({ roles: [], permissions: [] });
    renderPage();

    expect(
      await screen.findByText("Unable to load tenants"),
    ).toBeInTheDocument();
  });

  it("renders the real plan + active-credential columns from the overview aggregate", async () => {
    useAuthStore.getState().setAuthorization({ roles: [], permissions: [] });
    renderPage();
    await screen.findByText("Acme Co");

    // Plan column shows the real plan name; credential column shows active count.
    expect(await screen.findByText("Growth")).toBeInTheDocument();
    expect(tenantOverview).toHaveBeenCalledWith("t1");
  });

  it("exposes lifecycle actions in the row action menu (permission-gated)", async () => {
    useAuthStore.getState().setAuthorization({
      roles: ["SUPER_ADMIN"],
      permissions: ["platform.tenant.suspend", "platform.tenant.archive"],
    });
    renderPage();
    await screen.findByText("Acme Co");

    // The row actions are behind a menu; open it, then the gated actions show.
    fireEvent.click(
      screen.getByRole("button", { name: /Actions for Acme Co/i }),
    );
    expect(
      await screen.findByRole("menuitem", { name: /View tenant/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Suspend/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Archive/i }),
    ).toBeInTheDocument();
  });
});
