import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/__tests__/**",
        "*.config.ts",
        "**/*.d.ts",
        // Test harness — support code, not app code under test
        "src/core/testing/**",
        // Scaffolds with no behaviour yet (placeholder modules)
        "src/modules/orders/**",
        // Admin diagnostics — thin wrapper over prisma.$metrics, needs live DB
        "src/modules/admin/**",
        // Bootstrap / infra wired-and-verified via integration, not unit tested
        "src/server.ts",
        "src/app.ts",
        "src/telemetry.ts",
        "src/secrets.ts",
        "src/plugins/**",
        // Queue producers/workers + circuit breaker — verified via live smoke,
        // not unit tests (they require Redis/external services).
        "src/queue/**",
        "src/workers/**",
        "src/core/circuit-breaker.ts",
        // Static HTML landing page
        "src/modules/root/**",
        "src/config/config.ts",
      ],
      // Regression ratchet: fail CI if coverage of the tested surface drops
      // below the current floor. Raise these as more of the codebase gains tests.
      // Current: ~77% stmts/lines, ~78% branches, ~60% funcs.
      thresholds: {
        statements: 73,
        branches: 75,
        functions: 58,
        lines: 73,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@core": path.resolve(__dirname, "./src/core"),
      "@modules": path.resolve(__dirname, "./src/modules"),
      "@plugins": path.resolve(__dirname, "./src/plugins"),
      "@app/api-contracts": path.resolve(
        __dirname,
        "../../packages/api-contracts/src/index.ts",
      ),
    },
  },
});
