import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";

/**
 * DashboardPage renders the SaaS control-center overview from platform APIs
 * only. These tests cover success (stats + recent tenants), the platform-denied
 * error state, and resilience when the secondary activity feed fails.
 */
const dashboard = vi.fn();
const auditLogs = vi.fn();

vi.mock("@/modules/platform/platform.api", () => ({
  platformApi: {
    dashboard: () => dashboard(),
    auditLogs: () => auditLogs(),
  },
}));

import { DashboardPage } from "./dashboard-page";

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const STATS = {
  totalTenants: 3,
  activeTenants: 2,
  trialTenants: 1,
  suspendedTenants: 0,
  archivedTenants: 0,
  totalUsers: 10,
  platformUsers: 2,
  activeApiCredentials: 4,
  recentTenants: [
    {
      id: "t1",
      name: "Acme Co",
      slug: "acme",
      status: "ACTIVE",
      createdAt: new Date("2026-01-01").toISOString(),
    },
  ],
};

describe("DashboardPage", () => {
  beforeEach(() => {
    dashboard.mockReset();
    auditLogs.mockReset();
  });

  it("renders stats and recent tenants on success", async () => {
    dashboard.mockResolvedValue(STATS);
    auditLogs.mockResolvedValue([
      {
        id: "a1",
        action: "tenant.provisioned",
        tenantId: "t1",
        actorId: "u1",
        targetType: "TENANT",
        targetId: "t1",
        metadata: null,
        requestId: null,
        createdAt: new Date("2026-01-02").toISOString(),
      },
    ]);

    renderDashboard();

    expect(await screen.findByText("Platform Users")).toBeInTheDocument();
    expect(screen.getByText("Active API Keys")).toBeInTheDocument();
    // Recent tenants panel shows the tenant.
    expect(await screen.findByText("Acme Co")).toBeInTheDocument();
    // Recent activity panel shows the audit action.
    expect(await screen.findByText("tenant.provisioned")).toBeInTheDocument();
  });

  it("shows a clear message when the account is not a platform account", async () => {
    dashboard.mockRejectedValue(
      new ApiError("denied", 403, "req-1", "PLATFORM_ACCESS_DENIED"),
    );
    auditLogs.mockResolvedValue([]);

    renderDashboard();

    expect(
      await screen.findByText("Not a platform account"),
    ).toBeInTheDocument();
  });

  it("still renders stats when the activity feed fails", async () => {
    dashboard.mockResolvedValue(STATS);
    auditLogs.mockRejectedValue(new ApiError("boom", 500, "req-2"));

    renderDashboard();

    // Primary stats still render.
    expect(await screen.findByText("Total Tenants")).toBeInTheDocument();
    // Activity panel degrades gracefully.
    expect(
      await screen.findByText("Activity is unavailable right now."),
    ).toBeInTheDocument();
  });
});
