# Super Admin Frontend (`apps/super-admin`)

**Status:** Active — the sole frontend of `super-admin-platform`.

This document describes the ownership, boundaries, and deployment responsibility
of the Super Admin frontend. It replaces the historical `docs/ADMIN_FRONTEND.md`,
which described the now-removed tenant Admin (`apps/admin`).

---

## 1. Ownership

`apps/super-admin` is the platform control-plane frontend. It is a React + Vite
single-page application (`@app/super-admin`) that talks to the Platform API and
provides the operator-facing UI for the platform:

- authentication (login, session persistence, silent refresh)
- platform authorization / RBAC-aware UI (permission-gated navigation and actions)
- tenant management
- dashboard
- settings

It is the **only** frontend in this repository.

```text
super-admin-platform/
├── apps/
│   ├── platform-api/     # Fastify control-plane API (@app/api)
│   └── super-admin/      # Super Admin SPA — the sole frontend (@app/super-admin)
├── packages/
│   └── api-contracts/    # Shared TypeBox schemas (@app/api-contracts)
├── prisma/
├── docs/
└── scripts/
```

Source layout:

```text
apps/super-admin/src/
├── app/          # router, protected-route
├── layouts/      # platform layout / navigation
├── pages/        # login, dashboard, tenants, ...
├── modules/      # auth, platform (feature slices)
├── components/   # UI primitives
├── stores/       # zustand (auth.store.ts holds session + can())
├── lib/          # api-client, utils
├── config/       # runtime config (VITE_API_BASE_URL, timeouts)
└── styles/
```

---

## 2. Platform API relationship

The Super Admin frontend is a pure client of the Platform API. It never talks to
the database directly; every read and write goes through `apps/platform-api`.

- Requests are issued through a single typed API client (`src/lib/api-client.ts`).
  There are no raw `fetch()` calls scattered across components.
- The client attaches the bearer access token and performs silent
  `401 → refresh → retry` handling. On a failed refresh it clears the session.
- Request/response shapes and endpoint paths come from the shared
  `@app/api-contracts` package (TypeBox schemas + endpoint registry), the same
  package the API validates against. This makes contract drift impossible.
- RBAC in the UI is advisory only. `useAuthStore((s) => s.can)` gates what the
  operator sees, but the **API is the security boundary** — every protected
  operation is authorized server-side regardless of what the UI shows.

---

## 3. Frontend / API boundary

```text
Browser (apps/super-admin)
        |
        |  typed API client + @app/api-contracts (paths + schemas)
        v
   apps/platform-api  (Fastify routes → authorization → orchestrators → Prisma)
        |
        v
     PostgreSQL
```

The boundary is intentionally narrow: the frontend knows endpoint paths and DTOs
(from the contracts package) and nothing about the database, ORM, or internal
service wiring.

---

## 4. Why `apps/admin` was removed

The repository previously contained a second, tenant-facing Admin frontend at
`apps/admin`. It duplicated much of the platform frontend's stack (React, Vite,
TanStack Query, Tailwind, RBAC utilities) while overlapping in responsibility
with `apps/super-admin`. Maintaining two frontends against the same Platform API
added build, test, CI, and cognitive overhead without a corresponding benefit.

`apps/admin` was a self-contained SPA with **no runtime, build, or source
dependency** from `apps/platform-api` or `apps/super-admin`, so it could be
removed cleanly. `apps/super-admin` is now the single, canonical frontend.

The historical architecture of the removed app is preserved in
[`ADMIN_FRONTEND.md`](ADMIN_FRONTEND.md), which is marked historical.

---

## 5. Deployment responsibility

- The production **Docker image builds only the Platform API** (see the root
  `Dockerfile`). Frontends are intentionally excluded from that image
  (`.dockerignore` excludes `apps/super-admin`).
- The Super Admin frontend is a static Vite build (`npm run build:super-admin`)
  and is deployed as static assets, served independently of the API image.
- In development it runs on Vite (`npm run dev:super-admin`, port `5174`) and
  proxies `/api` to the API on `:3000`.

---

## 6. Environment

- `VITE_API_BASE_URL` — base URL the frontend calls. In dev it stays `/api/v1`
  (Vite proxies `/api` to the API); the versioned prefix comes from the shared
  endpoint registry. This is browser-safe (no secrets).

---

## 7. Future repository separation

Because the frontend and API share only the `@app/api-contracts` package and
communicate over HTTP, `apps/super-admin` could later be extracted into its own
repository with minimal friction. The prerequisites are already in place:

- a stable, published-style contracts boundary (`@app/api-contracts`)
- no cross-app source imports
- independent build and deployment pipelines

Until then, keeping it in this monorepo preserves the zero-drift guarantee
between the API and the frontend.
