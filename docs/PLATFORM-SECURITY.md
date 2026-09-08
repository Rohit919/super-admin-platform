# Platform Security (Frontend & Boundary)

**Phase 13 — Frontend Security** (per `SUPER-ADMIN-PLATFORM-CONVERSION-PLAN` §18).

This documents the security posture of the Super Admin frontend and its
relationship to the Platform API. The governing principle:

> **The frontend is not the security boundary.** Protected routes and
> permission-aware UI are for **UX only**. Every authorization decision is
> enforced server-side by `platform-api`.

Verification + documentation only — no code, schema, migration, or database
changes were made in this phase.

---

## 1. Enforcement chain

```text
Authenticated route (UX gate)
      ↓
Platform user state (token in store)
      ↓
Platform permissions (can() — UX gate)
      ↓
Permission-aware navigation (hide/show — UX only)
      ↓
Platform API request (Authorization: Bearer)
      ↓
Server-side authorization  ← the ONLY real boundary
   (authenticate + ACTIVE PlatformMembership + platform.* permission)
```

The last step is authoritative. Everything above it improves the experience but
grants nothing: bypassing the UI (crafting a request by hand) still hits the
server gate and fails with `403 PLATFORM_ACCESS_DENIED` without the required
membership + permission (see `docs/PLATFORM-RBAC.md`, `docs/PLATFORM-API.md`).

## 2. Protected routes are UX, not authorization

`apps/super-admin/src/app/protected-route.tsx` redirects unauthenticated users
to `/login` based solely on token presence (`isAuthenticated()`). It:

- does **not** decode or trust the token for authorization;
- does **not** decide platform access — an authenticated **non-platform** user
  can reach the shell, but every `/platform/*` call they make is rejected by the
  API (the pages surface a clear "not a platform account" / 403 message rather
  than exposing data).

So the route guard prevents a blank/broken screen for anonymous users; it is not
a security control.

## 3. Permission-aware UI is UX, not authorization

- Navigation (`platform-layout.tsx`) filters items by `can(permission)`.
- Action buttons (tenant status transitions, credential create/rotate/revoke)
  are shown only when the corresponding `platform.*` permission is present.
- `can()` (`stores/auth.store.ts`) reads the effective permissions loaded from
  `GET /users/me` via `usePlatformBootstrap`.

These checks **hide** controls the user can't use; they never **grant** access.
The matching server permission is enforced on every request regardless of what
the UI shows or hides. Hidden UI is not a substitute for server authorization
(plan §18: "Never rely on hidden UI controls as authorization").

## 4. Token & session handling

- The **access token** lives in the Zustand store (persisted under
  `super-admin-auth`) and is attached as `Authorization: Bearer <token>` by the
  central API client (`lib/api-client.ts`). No component reads it directly; there
  are no raw `fetch()` calls in pages.
- The **refresh token** is an **HTTP-only cookie** (set by the API,
  `SameSite=Strict`, path-scoped) — it is **not** accessible to JS and is never
  stored by the frontend. On a `401`, the client performs a single-flight
  refresh (cookie → new access token) and retries once; on failure it clears the
  session and routes to `/login`.
- Logout/`clearSession` wipes token + user + roles + permissions from the store.

> Note: persisting the access token (localStorage via the store) is a
> deliberate UX tradeoff for session continuity; it is a **short-lived** token,
> the refresh secret stays HTTP-only, and the server re-validates membership +
> `permissionVersion` on every request so a stale token cannot outlive an
> access change.

## 5. No secrets in browser storage (verified)

- **Tenant API credential secrets** are shown **once** after create/rotate in a
  dismissible in-page banner and live **only in React component state**. They are
  never written to `localStorage`/`sessionStorage`/the store, never re-fetched
  (the list endpoint never returns them), and are copied to the clipboard only on
  an explicit user click.
- The persisted store (`super-admin-auth`) holds **only** `accessToken`, `user`,
  `roles`, `permissions` — no tenant or credential secret.
- A repository check finds no `localStorage`/`sessionStorage` secret writes in
  `apps/super-admin/src` (plan §18: "Never store platform or tenant secret keys
  in browser storage").

## 6. Other frontend hardening (in place)

- **Contract-driven client:** all calls go through `lib/api-client.ts` using the
  shared TypeBox endpoint registry — no hardcoded URLs (enforced repo-wide by the
  API-drift check), reducing the chance of mis-targeted requests.
- **No `X-Tenant-Id` header:** the Super Admin client never sends a tenant
  header — platform operations are cross-tenant and tenant-scoped on the server
  only where appropriate.
- **Uniform error handling:** `403 PLATFORM_ACCESS_DENIED` is handled gracefully
  (message, not a crash), and the client never distinguishes "no membership" from
  "missing permission" (the server returns them identically — no enumeration).
- **Separate session from any tenant app:** the store persist key
  (`super-admin-auth`) is distinct, so the platform session is never shared with
  a tenant-facing app in the same browser.

## 7. What the frontend deliberately does NOT do

- It does not make authorization decisions that the server doesn't also make.
- It does not gate any data purely by hiding UI.
- It does not persist secrets.
- It does not hold a second/logistics session or call any logistics service
  (see `docs/PLATFORM-LOGISTICS-INTEGRATION.md`).

## 8. Verification performed

- `protected-route.tsx` gates on token presence only (UX redirect).
- `platform-layout.tsx` + pages gate controls by `can()`; the API enforces the
  same `platform.*` permission server-side (tests in
  `modules/platform/__tests__/*`).
- `api-client.ts` attaches Bearer from the store, uses the HTTP-only refresh
  cookie, single-flight refresh + retry, session clear on failure.
- No `localStorage`/`sessionStorage` secret writes; credential `secretKey` used
  only for one-time display + explicit clipboard copy.

---

## Gate

Phase 13 documents and verifies that the Super Admin frontend treats the backend
as authoritative: protected routes and `can()`-driven navigation are UX only,
the API enforces authentication + platform membership + `platform.*` permission
on every request, the refresh secret stays in an HTTP-only cookie, and no
platform/tenant secret is ever stored in the browser. No code, schema, migration,
or database change was made.
