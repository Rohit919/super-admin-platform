import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";

/**
 * AuditPage: renders events, applies the action filter (re-queries), and shows
 * a clear message on 403 PLATFORM_ACCESS_DENIED.
 */
const auditLogs = vi.fn();

vi.mock("@/modules/platform/platform.api", () => ({
  platformApi: { auditLogs: (q: unknown) => auditLogs(q) },
}));

import { AuditPage } from "./audit-page";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuditPage />
    </QueryClientProvider>,
  );
}

const LOG = {
  id: "a1",
  action: "TENANT_PROVISIONED",
  tenantId: "t1",
  actorId: "u1",
  targetType: "TENANT",
  targetId: "t1",
  metadata: null,
  requestId: null,
  createdAt: new Date("2026-01-02").toISOString(),
};

describe("AuditPage", () => {
  beforeEach(() => {
    auditLogs.mockReset();
    auditLogs.mockResolvedValue([LOG]);
  });

  it("lists audit events", async () => {
    renderPage();
    expect(await screen.findByText("TENANT_PROVISIONED")).toBeInTheDocument();
  });

  it("re-queries with the selected action filter", async () => {
    renderPage();
    await screen.findByText("TENANT_PROVISIONED");

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "TENANT_SUSPENDED" } });

    await waitFor(() =>
      expect(auditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ action: "TENANT_SUSPENDED" }),
      ),
    );
  });

  it("shows a clear message when not permitted", async () => {
    auditLogs.mockRejectedValue(
      new ApiError("denied", 403, "req", "PLATFORM_ACCESS_DENIED"),
    );
    renderPage();
    expect(await screen.findByText("Not permitted")).toBeInTheDocument();
  });
});
