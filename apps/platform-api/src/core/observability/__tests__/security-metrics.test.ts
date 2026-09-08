import { buildTestApp } from "@core/testing/test-app.js";
import { securityFailuresTotal } from "../security-metrics.js";

/**
 * Verifies the platform_security_failures_total counter increments when a
 * privileged request is denied — the actionable "auth-failure spike" signal
 * (plan §15). We read the counter value before/after a denied request.
 */
const BASE = "/api/v1/platform";

function token(app: Awaited<ReturnType<typeof buildTestApp>>): string {
  return app.jwt.sign({ id: "sa-1", email: "super@platform.io", role: "user" });
}

async function counterValue(reason: string): Promise<number> {
  const metrics = await securityFailuresTotal.get();
  const match = metrics.values.find(
    (v) => v.labels.type === "platform" && v.labels.reason === reason,
  );
  return match?.value ?? 0;
}

describe("platform_security_failures_total", () => {
  it("increments on a platform-access denial", async () => {
    const before = await counterValue("not_platform_member");

    // Default mock: platformMembership.findUnique -> null => not a member.
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/dashboard`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();

    const after = await counterValue("not_platform_member");
    expect(after).toBeGreaterThan(before);
  });
});
