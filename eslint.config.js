// Flat ESLint config for the monorepo (ESLint 9).
// - TS linting via typescript-eslint (recommended, non-type-checked for speed).
// - Node globals for the API and shared packages.
//
// NOTE: we export a plain flat-config array (not tseslint.config()) for
// unambiguous plugin/rule ordering.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

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
];
