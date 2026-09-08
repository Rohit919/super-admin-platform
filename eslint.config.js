// Flat ESLint config for the monorepo (ESLint 9).
// - TS linting via typescript-eslint (recommended, non-type-checked for speed).
// - React hooks + fast-refresh rules for the super-admin app.
// - Node globals for the API, browser globals for the super-admin frontend.
//
// NOTE: we export a plain flat-config array (not tseslint.config()) because the
// helper mangled the `plugins` map keys into array indices when combined with
// this version of eslint-plugin-react-hooks. A plain array is unambiguous.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import reactRefreshPlugin from "eslint-plugin-react-refresh";

// Normalize ESM interop: some plugins ship the plugin under `.default`.
const reactHooks = reactHooksPlugin.default ?? reactHooksPlugin;
const reactRefresh = reactRefreshPlugin.default ?? reactRefreshPlugin;

export default [
  // ── Ignore build output, deps, reference project, generated code ───────────
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "_Reference/**",
      "plop-templates/**",
      "plopfile.js",
      "prisma/**",
      "scripts/**",
      "**/*.config.{js,ts,mjs,cjs}",
      "**/vite-env.d.ts",
    ],
  },

  // ── Base JS + TS recommended rules for all source ──────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── TypeScript source: TS handles undefined-symbol checking, so disable the
  //    core no-undef rule (typescript-eslint's recommendation) and relax a few
  //    pragmatic rules. ──────────────────────────────────────────────────────
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // The codebase uses `any` sparingly and deliberately at a few framework
      // boundaries; keep it a warning rather than a hard error.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ── API + shared packages + tooling (Node globals) ─────────────────────────
  {
    files: [
      "apps/platform-api/**/*.ts",
      "packages/**/*.{ts,mjs,js}",
      "*.js",
      "*.mjs",
    ],
    languageOptions: { globals: { ...globals.node } },
  },

  // ── Super Admin (platform control-plane frontend — browser + React) ─────────
  {
    files: ["apps/super-admin/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // ── Tests (Vitest globals) ──────────────────────────────────────────────────
  {
    files: [
      "apps/super-admin/**/*.{test,spec}.{ts,tsx}",
      "apps/super-admin/src/test/**/*.{ts,tsx}",
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
