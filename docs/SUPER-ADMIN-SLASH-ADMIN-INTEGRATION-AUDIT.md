**# Slash Admin Integration Audit — Super Admin Platform**

_> \*\*Type:\*\* Audit & planning only. No application source, backend, contracts,_

_> prisma, or \`\_Reference/slash-admin\` files were modified to produce this_

_> document. No packages were installed. This is a blueprint for a future,_

_> incremental integration — not an implementation._

_>_

_> \*\*Scope compared:\*\* existing \`apps/admin\` (already implemented) vs the_

_> read-only reference \`\_Reference/slash-admin-main\`._

_>_

_> \*\*Basis:\*\* direct inspection of both codebases (existing admin: 97 source_

_> files incl. 10 test files / 48 passing tests; Slash Admin: its \`package.json\`_

_> and core source — apiClient, userStore, settingStore, auth guard/hook, routing_

_> sections, i18n, theme, components, pages)._

\---

**## 1. Executive Summary**

The existing \`apps/admin\` is a \*\*complete, production-oriented Admin Frontend\*\*

that already implements the entire first-integration scope (Dashboard, Auth,

Platform Users, Platform Roles, Platform Permissions, Tenants, Provisioning, Entitlements, Security, Audit, Settings, i18n, Themes, Tables, Forms). It is built

on React 18 + Vite + React Router 6 + Tailwind + shadcn-style primitives +

Zustand + TanStack Query + react-hook-form + zod + i18next, and — crucially — it

is wired to the real Fastify API through the shared \`@app/api-contracts\`

package, with silent token refresh, RBAC-aware routing/nav, a reusable

\`DataTable\`, and a Vitest test suite.

Slash Admin (\`\_Reference/slash-admin-main\`) is a mature UI reference on a

\*\*different concrete stack\*\*: React 19, react-router 7, \*\*Ant Design 5\*\* +

Tailwind v4 + \*\*vanilla-extract\*\* + styled-components, \*\*axios\*\*, \*\*MSW/Faker\*\*

mocks, apexcharts, a multi-tab shell, FullCalendar, react-quill, and a

permission model of \`{ code }\` objects.

\*\*Verdict: adopt Slash Admin PARTIALLY, as a UI/UX pattern reference only. No

rewrite. Keep the existing architecture, API layer, auth, and RBAC verbatim.\*\*

The existing admin already embodies most of Slash Admin's good patterns in a

stack that matches this monorepo. The valuable, low-risk borrowings are a

handful of \*\*UI/UX enrichments\*\* (command-palette search, richer account/notice

menus, \`input-otp\` styled OTP entry, optional row-selection/bulk-action table

affordances, a settings drawer for appearance) — recreated in this project's

stack, never copied.

Integrating Slash Admin's _\_code\__ wholesale would introduce Ant Design +

vanilla-extract + axios + MSW as duplicate, conflicting systems. That is the

primary risk and is explicitly disallowed by this plan.

\---

**## 2. Existing Architecture (\`apps/admin\`) — verified**

\*\*Package (\`@app/admin\`) scripts:\*\* \`dev\` (vite), \`build\` (\`tsc -b && vite

build\`), \`typecheck\`, \`lint\` (\`eslint src\`), \`test\`/\`test\:watch\` (vitest).

\*\*Stack (from \`package.json\`):\*\*

\- React \`18.3\`, React DOM \`18.3\`, TypeScript \`5.3\`, Vite \`5.4\`.

\- Routing: \`react-router-dom\` \`6.26\`.

\- UI: shadcn-style primitives built on \`@radix-ui/\*\` (dialog, dropdown-menu,

label, slot, switch) + \`class-variance-authority\` + \`clsx\` + \`tailwind-merge\`;

icons \`lucide-react\`.

\- CSS: Tailwind \`3.4\` + \`tailwindcss-animate\` + PostCSS/autoprefixer.

\- Client state: \`zustand\` \`4.5\`. Server state: \`@tanstack/react-query\` \`5.51\`.

\- Forms: \`react-hook-form\` \`7.53\` + \`zod\` \`3.23\` + \`@hookform/resolvers\` \`3.9\`.

\- i18n: \`i18next\` \`23\` + \`react-i18next\` \`15\`.

\- Charts: \`recharts\` \`2.12\`. Toasts: \`sonner\` \`1.5\`.

\- Shared: \`@app/api-contracts\` (workspace).

\- Testing: Vitest \`2.1\` + Testing Library (\`react\`/\`dom\`/\`jest-dom\`/\`user-event\`)

\- jsdom.

\*\*Directory structure (feature-sliced):\*\*

\`\`\`text

apps/admin/src/

├── app/{providers, router.tsx, router/route-config.ts, router/permission-route.tsx, protected-route.tsx}

├── components/{ui, data-table, forms, feedback, layout, common}

├── layouts/{admin, auth}

├── modules/{auth, dashboard, users, roles, permissions, settings, errors}

├── hooks/ # use-url-table-state

├── i18n/{index.ts, config.ts, locales/en/\*.json}

├── lib/{api-client, errors, notify, query-client, utils}

├── stores/ # auth.store (Zustand, persisted)

├── styles/globals.css # HSL theme tokens (light/dark)

└── test/ # setup + test-utils + vitest.d.ts

\`\`\`

\*\*Subsystems (as built):\*\*

\- \*\*API client\*\* (\`lib/api-client.ts\`): \`fetch\`-based, envelope-aware (handles

both \`{success,data}\` and \`{data,meta}\`), attaches JWT bearer, sends

\`credentials:'include'\`, \*\*single-flight 401→refresh→retry→redirect\*\*, request

\*\*timeout via AbortController\*\*, typed \`ApiError { message, statusCode,

requestId, code }\`.

\- \*\*Auth\*\* (\`modules/auth\`): login, forgot/verify-otp/reset password, logout,

change-password; Zustand \`auth.store\` (accessToken + user + roles +

permissions, persisted); \`useLogin/useLogout/usePasswordReset\`.

\- \*\*RBAC:\*\* \`usePermissions()\` (\`can/canAny/canAll/hasRole/hasAnyRole/

hasAllRoles\`), \`\<PermissionGate>\`, \`\<PermissionRoute>\` (403 page), permission-

filtered sidebar driven by \`route-config.ts\`.

\- \*\*Tables:\*\* one reusable \`components/data-table\` (server-side sort/pagination,

search/filter toolbar, column visibility, row actions, loading/empty/error);

URL-synced via \`useUrlTableState\`.

\- \*\*Forms:\*\* \`components/forms/form-field.tsx\` (\`FormField\`/\`TextField\`/

\`FieldError\`) + zod schemas mirroring the backend contracts.

\- \*\*Theme:\*\* central \`ThemeProvider\` (light/dark/system, persisted, \`.dark\`

class + HSL tokens), \`ThemeSwitcher\`.

\- \*\*i18n:\*\* \`i18next\` with 9 \`en\` namespaces (\`common, nav, auth, users, roles,

permissions, settings, dashboard, validation\`).

\- \*\*Feedback:\*\* \`Loading\`, \`EmptyState\` (empty vs no-results), \`ErrorState\`

(message + requestId + retry), \`ConfirmDialog\`, \`ErrorBoundary\`,

\`notify\` (single sonner entry point).

\- \*\*Testing:\*\* 10 files / 48 tests (auth store, errors, permission-gate,

protected/permission routes, api-client 401/refresh/timeout, login flow,

logout, users.api, group-permissions).

\---

**## 3. Slash Admin Architecture (\`\_Reference/slash-admin-main\`) — verified**

\*\*Stack (from \`package.json\`):\*\* React \*\*19\*\*, \`react-router\` \*\*7\*\*, \*\*Ant

Design 5\*\* (\`antd\`), Tailwind \*\*v4\*\* (\`@tailwindcss/vite\`) + \*\*vanilla-extract\*\*

\- \`styled-components\`, \`@radix-ui\`, \`class-variance-authority\`, \*\*axios\*\*,

TanStack Query, Zustand, react-hook-form + zod, \*\*i18next +

i18next-browser-languagedetector\*\*, sonner, \*\*MSW + @faker-js/faker\*\* (mocks),

\`apexcharts\`/\`react-apexcharts\`, \`@dnd-kit/\*\`, \`@fullcalendar/\*\`, \`react-quill\`,

\`input-otp\`, \`cmdk\`, \`motion\`, \`screenfull\`, \`vaul\`, \`numeral\`, \`dayjs\`. Node 20,

pnpm, Biome (lint/format), lefthook.

\*\*Structure:\*\* \`src/{App.tsx, main.tsx, api, components, layouts, pages, routes,

store, theme, locales, ui, hooks, types, utils, \_mock, assets, global-config.ts}\`.

\- \*\*API layer\*\* (\`api/apiClient.ts\`): a single \*\*axios\*\* instance; response

interceptor unwraps a \`Result { status, data, message }\` shape and toasts

errors; \*\*request interceptor hardcodes \`Authorization: "Bearer Token"\`\*\*

(mock); on 401 clears the user store. \`api/services/{userService, menuService,

demoService}.ts\` are \*\*mock services\*\*.

\- \*\*State\*\* (\`store/\`): \`userStore\` (userInfo + userToken, persisted; \`useSignIn\`

mutation) and \`settingStore\` (theme mode/layout/color-preset/font/RTL/multi-tab,

persisted).

\- \*\*Auth/RBAC:\*\* \`routes/components/login-auth-guard.tsx\` (redirect if no token);

\`components/auth/{auth-guard.tsx, use-auth.ts}\` — \`useAuthCheck('permission'|

'role')\` with \`check/checkAny/checkAll\`, but permissions are \*\*objects with a

\`.code\`\*\* field (\`resourcePool.some(p => p.code === item)\`).

\- \*\*Routing\*\* (\`routes/sections/{auth, dashboard, main}.tsx\`): section-based;

dashboard has \`frontend\`/\`backend\` nav-data variants (menu can be

backend-driven).

\- \*\*Layouts:\*\* \`layouts/dashboard\` with header, vertical/horizontal/mobile nav,

and a \*\*multi-tab\*\* system (\`@dnd-kit\` sortable tabs).

\- \*\*UI:\*\* \`src/ui/\*\` = a full shadcn-style set (avatar, badge, button, card,

command, dialog, drawer, dropdown-menu, form, input-otp, select, sheet,

sidebar, skeleton, switch, tabs, tooltip, …). \`components/\*\` adds nav, chart,

editor (react-quill), icon (iconify), locale-picker, toast, upload, animate.

\- \*\*Theme:\*\* \`theme/theme-provider.tsx\` + vanilla-extract tokens + an \*\*Ant

Design theme adapter\*\* + color-preset engine.

\- \*\*i18n:\*\* \`locales/{i18n.ts, use-locale.ts, lang/{en\_US, zh\_CN}}\`; i18next +

browser-languagedetector; \`en\_US\`/\`zh\_CN\`.

\- \*\*Mocks:\*\* \`src/\_mock\` + MSW worker (\`public/mockServiceWorker.js\`) + Faker.

\- \*\*Pages:\*\* large demo surface (\`pages/{dashboard, management, components,

functions, menu-level, sys}\`) — management (user/role/permission) plus many

demo/showcase pages.

\---

**## 4. Technology Comparison**

\| Technology/Concern | Existing Admin | Slash Admin | Recommendation |

\| ------------------ | ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |

\| React | 18.3 | 19 | \*\*Keep existing\*\* (18). No feature needs 19. |

\| TypeScript | 5.3 | 5.6 | Keep; bump opportunistically, not for this. |

\| Vite | 5.4 | 6 | Keep 5; evaluate 6 later, unrelated to Slash Admin. |

\| Routing | react-router-dom 6 | react-router 7 | \*\*Keep existing\*\* (RR6). RR7 APIs differ. |

\| UI library | shadcn-style + Radix | \*\*Ant Design 5\*\* + Radix | \*\*Keep existing.\*\* Do NOT add AntD (dup system). |

\| Tailwind | v3 | v4 | Keep v3. v4 migration is a separate, unrelated project. |

\| shadcn/ui | Yes (curated set) | Yes (larger set in \`src/ui\`) | \*\*Merge selectively\*\* — recreate a few missing primitives (command, drawer/sheet, tabs, input-otp) in the existing stack. |

\| State management | Zustand | Zustand | \*\*Keep\*\* (same). Adopt the \`actions\` namespace idea if refactoring stores. |

\| Server state | TanStack Query 5 | TanStack Query 5 | \*\*Keep\*\* (same). |

\| Forms | RHF + zod + resolvers | RHF + zod + resolvers | \*\*Keep\*\* (same); optionally adopt a \`\<Form>\` context wrapper pattern. |

\| Validation | zod | zod | \*\*Keep\*\* (same). |

\| Tables | custom shared \`DataTable\` | AntD Table | \*\*Keep existing\*\*; adopt row-selection/bulk-action _\_patterns\__ only. |

\| i18n | i18next + react-i18next | i18next + langdetector | \*\*Keep\*\*; optionally add \`i18next-browser-languagedetector\` (evaluate later). |

\| Themes | HSL tokens + \`.dark\` | vanilla-extract + AntD adapter | \*\*Keep existing.\*\* Do NOT adopt vanilla-extract/AntD theming. |

\| Icons | lucide-react | iconify + lucide | \*\*Keep\*\* lucide; add iconify only if a needed glyph is missing (evaluate later). |

\| Testing | Vitest + RTL (48 tests) | none shipped | \*\*Keep existing\*\* (Slash Admin adds nothing here). |

\| Charts | recharts | apexcharts | \*\*Keep\*\* recharts. |

\| HTTP | fetch (custom client) | axios | \*\*Keep\*\* fetch client. Do NOT add axios. |

\| Mocks | none | MSW + Faker | \*\*Ignore.\*\* Never bring mocks into this app. |

\*\*Rule applied:\*\* nothing is recommended for change merely because Slash Admin

uses it. Every "keep" is because the existing choice already satisfies the

requirement on this project's stack.

\---

**## 5. Architecture Comparison**

\| Area | Existing Admin | Slash Admin | Final Direction |

\| ---------------- | -------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |

\| Folder structure | \`modules/\` feature slices + \`components/\*\` + \`lib/\` | \`pages/\` + \`ui/\` + \`components/\` + \`store/\` | \*\*Keep existing\*\*; add \`modules/logistics/\*\` later. |

\| Layout | AdminLayout (sidebar+header+breadcrumb) + AuthLayout | dashboard shell + multi-tab + variants | \*\*Keep\*\*; optionally adopt account/notice menu richness (ADAPT). |

\| Routing | central \`route-config.ts\` + guards + lazy | section files + backend-driven menu | \*\*Keep\*\*; keep single route-config source of truth. |

\| API | \`fetch\` client + \`@app/api-contracts\` | axios + \`Result\` + mock services | \*\*Keep existing.\*\* Slash Admin API layer is IGNORE. |

\| Authentication | real JWT + httpOnly refresh cookie + silent refresh | mock (\`Bearer Token\`, \`/auth/signin\`) | \*\*Keep existing logic\*\*; ADAPT only auth _\_UI\__ affordances. |

\| RBAC | flat string perms, \`usePermissions\`, guards | \`{code}\` objects, \`useAuthCheck\` | \*\*Keep existing\*\*; the hook API already matches. |

\| Dashboard | StatCard + recharts + QuickActions + metrics abstraction | apexcharts widgets + demo data | \*\*Keep\*\*; ADAPT card/chart layout ideas, no mock data. |

\| Users | list + filters + role-assign (real API) | mock CRUD table | \*\*Keep\*\*; adopt table affordances; CRUD blocked on backend. |

\| Roles | CRUD + permission editor (real API) | mock role/menu mgmt | \*\*Keep\*\* (already superior for this backend). |

\| Permissions | grouped-by-resource read-only | menu-permission tree | \*\*Keep\*\* grouped approach. |

\| Settings | tabbed profile/appearance/security | settings drawer (theme presets/RTL/font/tabs) | \*\*Keep\*\*; optionally ADAPT a drawer for appearance. |

\| Tables | one reusable DataTable | AntD Table per page | \*\*Keep\*\*; single DataTable is the right call. |

\| Forms | shared field abstraction | AntD Form / shadcn form | \*\*Keep\*\*; optionally adopt \`\<Form>\` context wrapper. |

\| Themes | central provider, HSL tokens | vanilla-extract + AntD adapter | \*\*Keep existing.\*\* |

\| i18n | i18next + 9 namespaces (en) | i18next + langdetector (en/zh) | \*\*Keep\*\*; add languages via new locale folders. |

\| Notifications | \`notify\` (sonner) | sonner + toast component | \*\*Keep\*\* (same base lib). |

\| Error handling | \`mapApiError\` + ErrorBoundary + ErrorState(requestId) | axios interceptor toasts | \*\*Keep existing\*\* (more structured). |

\---

**## 6. Module Comparison (scope: Dashboard, Auth, Platform Users, Platform Roles, Platform Permissions, Tenants, Provisioning, Entitlements, Security, Audit, Settings, i18n, Themes, Tables, Forms)**

Every scope module \*\*already exists\*\* in \`apps/admin\` and is wired to the real

backend. Slash Admin's equivalent modules are demo/mock. Therefore the module-

level recommendation is uniformly \*\*keep existing implementation; borrow

selected UI patterns\*\*. Logistics modules are out of scope now but the

\`modules/\*\` slice pattern accommodates them (§28).

\---

**## 7. Authentication Analysis**

\*\*Existing (authoritative — must remain unchanged):\*\*

\- Login = \*\*email + password only\*\* (no login OTP). \`POST /api/v1/auth/login\`

→ \`{ data: { accessToken, user } }\` + \`Set-Cookie: refreshToken\` (httpOnly,

SameSite=Strict, path \`/api/v1/auth\`).

\- Session bootstrap via \`GET /users/me\` (profile + effective roles/permissions).

\- Silent refresh: \`POST /auth/refresh\` (cookie), single-flight, retry once, else

clear session → \`/login\`. Logout + logout-all + change-password revoke

sessions server-side.

\- Password recovery (the \*\*only\*\* OTP path): \`forgot-password\` →

\`password-reset/verify\` (returns single-use resetToken) → \`password-reset/

confirm\`.

\- Client stores access token + user + roles/permissions (Zustand, persisted);

the refresh token is never JS-readable.

\*\*Slash Admin auth (reference):\*\* mock (\`/auth/signin\`, username, hardcoded

\`Bearer Token\`), \`LoginAuthGuard\` redirect, \`input-otp\` component, styled login

layout, account dropdown.

\*\*Recommendation:\*\* \*\*KEEP EXISTING auth logic and contract entirely.\*\* ADAPT

only UI affordances if desired: the \`input-otp\` segmented code entry on the

reset-OTP page, and a richer account dropdown. Missing pages? None — login,

forgot, verify-otp (reset), reset already exist. Do NOT adopt Slash Admin's

mock service, username login, or axios \`Bearer Token\` interceptor.

_> Slash Admin's authentication UI may be reused; the existing project's auth_

_> contract and backend integration remain authoritative._

\---

**## 8. RBAC Analysis**

\*\*Existing relationship (verified):\*\* \`User ─< UserRole >─ Role ─< RolePermission

_> ─ Permission\`. Effective permissions are the union across roles, returned by_

\`/users/me\`as \*\*flat string arrays\*\*\`roles[]\`+\`permissions[]\`. Keys are

\`resource.action\`. Frontend: \`usePermissions()\` (\`can/canAny/canAll/hasRole/

_> hasAnyRole/hasAllRoles\`), \`\<PermissionGate>\`, \`\<PermissionRoute>\` (403),_

_> permission-filtered nav._

\*\*Slash Admin RBAC:\*\* \`useAuthCheck('permission'|'role')\` with \`check/checkAny/

checkAll\` — same conceptual shape, but permissions are \`{ code }\` \*\*objects\*\*.

\*\*Recommendation:\*\* \*\*KEEP EXISTING.\*\* The existing hook API already matches (and

exceeds) Slash Admin's, and uses the backend's real string model. Do NOT adopt

the \`{ code }\` object shape. The requested centralized API

(\`hasPermission/hasAnyPermission/hasAllPermissions/hasRole/hasAnyRole\`) already

exists as \`can/canAny/canAll/hasRole/hasAnyRole/hasAllRoles\`; if exact naming is

desired, add thin aliases — cosmetic only. \*\*Backend \`requirePermission\` remains

the authorization boundary; frontend RBAC is UX only.\*\*

\---

**## 9. API Analysis**

\*\*Existing (must be preserved):\*\*

\`\`\`text

Component → feature hook (Query) → modules/\*/api service → lib/api-client → @app/api-contracts → Fastify

\`\`\`

Single \`fetch\` client; endpoints + DTOs from the shared contracts package;

envelope-aware; typed errors; silent refresh; timeout.

\*\*Slash Admin API:\*\* a separate \*\*axios\*\* client with a \`Result\`/\`ResultStatus\`

unwrap and \*\*mock services\*\*. This \*\*conflicts\*\* with the existing architecture.

\*\*Recommendation (explicit):\*\*

_> \*\*Keep the existing project's API architecture and use Slash Admin only for_

_> UI/application patterns.\*\* Do NOT introduce axios, a second API client, the_

_> \`Result\` envelope type, or any duplicate endpoint definitions. All endpoints_

_> stay centralized in \`@app/api-contracts\`._

\---

**## 10. State Management Analysis**

\| State | Correct home | Existing status |

\| ------------------------------------------------------------- | ------------------------ | ------------------------------- |

\| Server/API data (users, roles, permissions, \`/me\`, dashboard) | TanStack Query | ✅ correct |

\| Global UI/session (access token, user, roles/permissions) | Zustand (\`auth.store\`) | ✅ correct |

\| Theme, language | providers + localStorage | ✅ correct |

\| Search/filter/sort/pagination | URL query params | ✅ correct (\`useUrlTableState\`) |

\| Dialog open, form fields | React local state / RHF | ✅ correct |

\*\*No violations found.\*\* No server datasets live in Zustand. Recommendation:

\*\*keep as-is\*\*; optionally adopt Slash Admin's \`actions\`-namespace store

convention if/when stores are refactored (cosmetic). Do NOT introduce duplicate

state or a second store for the same data.

\---

**## 11. Table Analysis (high priority)**

\| Capability | Existing DataTable | Slash Admin (AntD Table) | Direction |

\| -------------------------- | ----------------------- | ------------------------ | -------------------------------------------------------- |

\| Sorting (server-side) | ✅ | ✅ | Keep |

\| Filtering | ✅ (toolbar slot) | ✅ | Keep |

\| Search | ✅ (debounced) | ✅ | Keep |

\| Pagination (server-side) | ✅ (\`OffsetPageMeta\`) | ✅ | Keep |

\| Column visibility | ✅ | ✅ | Keep |

\| Row selection | ❌ | ✅ | \*\*ADAPT\*\* (add optional selection to existing DataTable) |

\| Row actions | ✅ | ✅ | Keep |

\| Bulk actions | ❌ | ✅ | \*\*ADAPT\*\* (blocked on backend bulk endpoints) |

\| Loading/empty/error states | ✅ | ✅ | Keep |

\| Responsive | ✅ (overflow + mobile) | ✅ | Keep |

\| URL query sync | ✅ (\`useUrlTableState\`) | partial | Keep (existing is stronger) |

\*\*Recommendation:\*\* \*\*KEEP\*\* the single reusable \`DataTable\`; it already backs

Users/Roles/Permissions and will back future \`ShipmentsTable/DriversTable/

OrdersTable/VehiclesTable\` unchanged. \*\*ADAPT\*\* only two additive capabilities —

optional row selection + a bulk-action bar — recreated in the existing component

(not AntD). Do NOT introduce AntD Table (would create a second table framework).

_> \*\*Update (post-implementation):\*\* the backend user CRUD + self profile-update_

_> endpoints are now implemented, so the Users module no longer degrades to_

_> list-only — it has create/edit/delete (permission-gated, with a self-delete_

_> guard) plus role assignment, and Settings → Profile is editable. The_

_> \*\*DataTable row-selection + bulk-action bar\*\* (this section's ADAPT item) is_

_> now implemented and wired to a permission-gated \*\*bulk delete\*\* on the Users_

_> page (excludes the current user). A real \*\*dashboard-metrics endpoint\*\*_

_> (\`GET /admin/dashboard\`) and a \*\*command palette\*\* (⌘/Ctrl-K, §17 adopt list)_

_> are also now implemented. Remaining optional polish: extra UI primitives_

_> (drawer/sheet), a notice menu, and language auto-detect._

\---

**## 12. Form Analysis**

\| Concern | Existing | Slash Admin | Direction |

\| -------------------- | -------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |

\| Library | RHF + zod | RHF + zod | Keep |

\| Schema validation | zod schemas mirroring contracts | zod | Keep |

\| Reusable fields | \`FormField/TextField/FieldError\` | shadcn \`\<Form>\` + AntD Form | \*\*Merge\*\* (optionally add a \`\<Form>\` context wrapper for larger forms) |

\| Validation messages | i18n keys | i18n | Keep |

\| Server errors | \`mapApiError\` + inline/toast | axios toast | Keep existing |

\| Loading/submit/reset | ✅ | ✅ | Keep |

\| Accessibility | labels + \`aria-invalid\` + \`role=alert\` | ✅ | Keep |

\*\*Recommendation:\*\* \*\*KEEP existing\*\* form architecture; optionally \*\*ADAPT\*\* a

\`\<Form>\`/\`\<FormField>\` context wrapper (shadcn pattern present in Slash Admin's

\`ui/form.tsx\`) for future large logistics forms. Existing primitives already

cover auth/role/settings forms.

\---

**## 13. Theme Analysis**

\- Existing: one \`ThemeProvider\`, light/dark/system, persisted, \`.dark\` class +

HSL CSS variables; all surfaces + recharts theme-correctly.

\- Slash Admin: vanilla-extract tokens + AntD theme adapter + color-preset engine

\- font/RTL/stretch settings.

\*\*Recommendation:\*\* \*\*KEEP existing.\*\* It fully satisfies light/dark/system +

persistence + component/chart compatibility with far less machinery. Do NOT

adopt vanilla-extract or the AntD adapter (would fork the styling system).

Optional future enrichment: an "appearance" settings drawer and (if ever needed)

a small accent-color preset — recreated on the existing token model.

\---

**## 14. i18n Analysis**

\- Existing: i18next + react-i18next; 9 \`en\` namespaces; \`setLanguage()\` persists

to localStorage; \`fallbackLng: en\`; validation + API-error messages localized;

permission keys never translated.

\- Slash Admin: i18next + \*\*i18next-browser-languagedetector\*\*; \`en\_US\`/\`zh\_CN\`;

a \`locale-picker\` component.

\*\*Recommendation:\*\* \*\*KEEP existing\*\* structure. It already meets every

requirement (namespaces, switching, persistence, fallback, form/validation/API

messages, additional-language readiness). Optional ADAPT: add

\`i18next-browser-languagedetector\` for auto-detection and a \`locale-picker\` UI —

\*\*evaluate later\*\*, not required for English-only launch.

\---

**## 15. Migration Strategy**

Because \`apps/admin\` already exists and is superior for this backend, "migration"

\= \*\*selectively recreating a few Slash Admin UI patterns in the existing stack\*\*,

never copying files. Per major Slash Admin area:

\| Slash Admin area | Classification | Note |

\| ----------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |

\| Layout (dashboard shell) | \*\*KEEP EXISTING\*\* | AdminLayout already covers it. |

\| Sidebar / nav | \*\*KEEP EXISTING\*\* (ADAPT collapse/section polish) | permission-filtered already. |

\| Header / account dropdown / notice | \*\*ADAPT\*\* | recreate richer account + optional notice menu. |

\| Command palette (\`cmdk\`) search | \*\*ADAPT\*\* | net-new UX; recreate with a headless combobox. |

\| Multi-tab shell | \*\*IGNORE\*\* | out of scope; heavy; \`@dnd-kit\` dependency. |

\| Dashboard widgets | \*\*ADAPT\*\* | layout ideas only; recharts; no mock data. |

\| Auth UI (login/forgot/reset, input-otp) | \*\*ADAPT\*\* | recreate \`input-otp\` segmented entry. |

\| Auth logic / guard | \*\*KEEP EXISTING\*\* | real JWT + cookie + refresh. |

\| RBAC (\`useAuthCheck\`) | \*\*KEEP EXISTING\*\* | string model, existing hooks. |

\| API client (axios) | \*\*IGNORE\*\* / KEEP EXISTING | fetch client + contracts stay. |

\| Mock API (MSW/Faker) | \*\*IGNORE\*\* | never in this app. |

\| DataTable | \*\*KEEP EXISTING\*\* (ADAPT selection/bulk) | additive only. |

\| Forms | \*\*KEEP EXISTING\*\* (ADAPT \`\<Form>\` wrapper) | optional. |

\| Theme | \*\*KEEP EXISTING\*\* | no vanilla-extract/AntD adapter. |

\| i18n | \*\*KEEP EXISTING\*\* (ADAPT langdetector/picker later) | optional. |

\| UI primitives (\`src/ui/\*\`) | \*\*RECREATE (selective)\*\* | add missing: command, drawer/sheet, tabs, input-otp, tooltip. |

\| Settings drawer | \*\*ADAPT\*\* | optional appearance drawer. |

\| Editor / upload / calendar / charts(apex) | \*\*IGNORE\*\* | out of scope / stack mismatch. |

Legend: COPY (none), ADAPT (recreate pattern in existing stack), RECREATE

(build a missing primitive here), KEEP EXISTING, IGNORE (reference only).

\---

**## 16. What to Keep (from existing Admin)**

Everything core: the \`fetch\` API client + \`@app/api-contracts\` integration; the

auth logic, store, and refresh; the RBAC hooks/guards/nav; the \`DataTable\`; the

form primitives; the theme provider; the i18n setup; error handling

(\`mapApiError\`, \`ErrorBoundary\`, \`ErrorState\` with requestId); the feature-slice

\`modules/\*\` structure; the Vitest suite; the lint/CI/hooks gates.

\---

**## 17. What to Adopt (from Slash Admin — as patterns, recreated)**

1\. \*\*UI primitives not yet present\*\*, recreated on Radix + Tailwind: \`command\`

(palette), \`drawer\`/\`sheet\`, \`tabs\`, \`input-otp\`, \`tooltip\`.

2\. \*\*Command-palette global search\*\* (Cmd/Ctrl-K) for quick navigation.

3\. \*\*Richer account dropdown\*\* + optional \*\*notice/notification menu\*\* in header.

4\. \*\*Optional DataTable row-selection + bulk-action bar\*\* (additive).

5\. \*\*Optional \`\<Form>\` context wrapper\*\* for large forms.

6\. \*\*Optional appearance settings drawer\*\*; \*\*optional\*\* language auto-detect +

\`locale-picker\` (evaluate later).

All adopted as UI/UX patterns — implemented in this project's stack, wired to the

existing API/RBAC/theme systems.

\---

**## 18. What to Replace**

\*\*Nothing.\*\* No existing module or subsystem is inferior enough to justify

replacement. (No rewrite — see §36.) The only "changes" are _\_additive\__

enrichments in §17.

\---

**## 19. What to Ignore (reference-only)**

Verified in the reference and to be left in \`\_Reference/\` only:

\- \`src/\_mock/\*\` + MSW worker + \`@faker-js/faker\` — mock/demo APIs (\*\*leakage

risk if copied\*\*).

\- \`api/apiClient.ts\` (axios, \`Bearer Token\`) + \`api/services/\*\` mock services.

\- Ant Design, vanilla-extract, styled-components theming.

\- Multi-tab shell + \`@dnd-kit\`; FullCalendar; react-quill editor; apexcharts;

\`screenfull\`/fullscreen; upload widget.

\- \`zh\_CN\` locale bundle; username-based \`/auth/signin\`; the \`{code}\` permission

model; react-router-7 APIs; Biome/lefthook config.

\---

**## 20. Recommended Folder Structure (\`apps/admin\`)**

Keep the current tree; only \*\*add\*\* to it over time:

\`\`\`text

apps/admin/src/

├── app/{providers, router.tsx, router/\*, protected-route.tsx}

├── components/

│ ├── ui/ # + command, drawer/sheet, tabs, input-otp, tooltip (new primitives)

│ ├── data-table/ # + optional row-selection / bulk-action bar

│ ├── forms/ # + optional \<Form> context wrapper

│ ├── feedback/ # Loading/Empty/Error/Confirm/ErrorBoundary

│ ├── layout/ # + richer account dropdown / notice menu / command-palette trigger

│ └── common/

├── layouts/{admin, auth}

├── modules/

│ ├── auth/ dashboard/ users/ roles/ permissions/ settings/ errors/

│ └── logistics/ # FUTURE ONLY: shipments/ orders/ drivers/ … (do not create now)

├── hooks/ # use-url-table-state (+ future shared hooks)

├── i18n/{index.ts, config.ts, locales/\<lng>/\*.json}

├── lib/ # api-client, errors, notify, query-client, utils

├── stores/ # auth.store (+ optional ui.store for command palette/drawers)

├── styles/globals.css

├── types/ # (only if a non-contract shared type emerges; prefer @app/api-contracts)

└── test/

\`\`\`

Responsibilities: \`components/\*\` = generic/dumb reusable UI; \`modules/\*\` =

feature UI+hooks+api+schemas; \`lib/\*\` = cross-cutting infra; \`stores/\*\` = global

client state; \`i18n\`/\`styles\` = presentation infra; \`app/\*\` = wiring.

\---

**## 21. Dependency Rules**

\`\`\`text

Pages (route elements)

↓

Feature components (modules/\*/components)

↓

Feature hooks (modules/\*/hooks)

↓

API services (modules/\*/api)

↓

Central API client (lib/api-client) → @app/api-contracts

↓

Fastify API

\`\`\`

Forbidden edges (generic UI must stay reusable): \`components/\*\` → \`modules/\*\`;

\`components/\*\` → \`lib/api-\*\`; \`components/\*\` → \`stores/auth\`; \`components/\*\` →

RBAC/auth internals; \`lib/\*\` → \`modules/\*\`. New adopted primitives (command,

drawer, etc.) MUST live in \`components/ui\` with no feature/API/auth imports.

\---

**## 22. Implementation Phases**

_> Note: the existing admin already satisfies Phases equivalent to a full build._

_> The phases below are scoped to \*\*this Slash-Admin enrichment effort\*\* (additive,_

_> incremental). Each phase must pass the quality gates in §24._

\*\*Phase 1 — Audit approval.\*\*

\- Objective: sign off this document as the blueprint.

\- Existing files: docs only. Slash Admin ref: none. Changes: none.

\- Dependencies: none. Acceptance: stakeholder approval. Risk: scope creep.

\*\*Phase 2 — Missing UI primitives (design-system parity).\*\*

\- Objective: add \`command\`, \`drawer\`/\`sheet\`, \`tabs\`, \`input-otp\`, \`tooltip\` to

\`components/ui\` (Radix + Tailwind, theme-token styled).

\- Existing files: \`components/ui/\*\`, \`styles/globals.css\`. Ref:

\`\_Reference/.../src/ui/{command,drawer,sheet,tabs,input-otp,tooltip}.tsx\`.

\- Changes: new primitive files + a Radix dep or two (\`@radix-ui/react-tabs\`,

\`@radix-ui/react-tooltip\`, \`cmdk\`, \`vaul\`, \`input-otp\`).

\- Dependencies: none. Acceptance: primitives render in light/dark, typecheck +

lint + build pass, a unit test per primitive. Risk: dependency bloat — add

only what a phase uses.

\*\*Phase 3 — Layout + navigation polish.\*\*

\- Objective: richer account dropdown + optional notice menu + command-palette

trigger in the header; sidebar collapse polish.

\- Existing files: \`components/layout/{header,sidebar,user-menu}.tsx\`,

\`app/router/route-config.ts\`. Ref: \`layouts/dashboard/\*\`,

\`layouts/components/{account-dropdown,notice,search-bar}.tsx\`.

\- Changes: header/menu components; a \`ui.store\` for palette/drawer open state.

\- Dependencies: Phase 2. Acceptance: keyboard-accessible menus + palette; nav

still permission-filtered. Risk: over-porting multi-tab (explicitly excluded).

\*\*Phase 4 — Theme (verify only).\*\*

\- Objective: confirm existing theme covers new primitives; optional appearance

drawer.

\- Existing files: \`app/providers/theme-provider.tsx\`, \`settings/appearance\`.

\- Changes: minimal. Dependencies: Phase 2. Acceptance: all new primitives themed.

Risk: none material.

\*\*Phase 5 — Central API (no change / guard).\*\*

\- Objective: confirm no new API client is introduced by any adopted UI.

\- Existing files: \`lib/api-client.ts\`. Changes: none expected. Acceptance: still

one client; no axios. Risk: accidental second client — reject in review.

\*\*Phase 6 — Authentication UI enrichment.\*\*

\- Objective: segmented \`input-otp\` on the reset-OTP page; polished auth layout.

\- Existing files: \`modules/auth/components/verify-otp-page.tsx\`,

\`layouts/auth/\*\`. Ref: Slash Admin login + \`ui/input-otp.tsx\`.

\- Changes: OTP field UI only — \*\*auth logic unchanged\*\*. Dependencies: Phase 2.

Acceptance: reset flow still calls the real endpoints; tests green. Risk: auth

regression — covered by existing login/reset tests.

\*\*Phase 7 — RBAC UI (verify / optional aliases).\*\*

\- Objective: confirm guards/gates cover new UI; optionally add

\`hasPermission\`/\`hasAnyPermission\` name aliases.

\- Existing files: \`modules/auth/hooks/use-permissions.ts\`,

\`components/.../permission-gate.tsx\`. Changes: optional aliases. Acceptance:

new actions gated; backend still enforces. Risk: none.

\*\*Phase 8 — Users (table affordances).\*\*

\- Objective: optional row-selection + bulk-action bar; keep list/filter/role-

assign. Create/edit/delete remain \*\*blocked on backend\*\* (do not fake).

\- Existing files: \`modules/users/\*\`, \`components/data-table/\*\`. Acceptance:

selection works; no dead CRUD buttons. Risk: implying unsupported CRUD.

\*\*Phase 9 — Roles.\*\* Verify; adopt any dialog/editor UX polish. Keep real CRUD.

Acceptance: CRUD + permission assignment unaffected.

\*\*Phase 10 — Permissions.\*\* Keep grouped-by-resource; optional search/section

polish. Acceptance: scalable rendering with many permissions.

\*\*Phase 11 — Dashboard.\*\* Adopt card/chart layout ideas (recharts, no mock

data); keep the metrics abstraction. Acceptance: loading/empty/error intact;

metrics still API-ready.

\*\*Phase 12 — Settings.\*\* Optional appearance drawer; keep profile(read-only)/

security. Acceptance: only backend-supported actions shown.

\*\*Phase 13 — i18n.\*\* Optional langdetector + locale-picker; keep namespaces.

Acceptance: adding a locale needs no component changes.

\*\*Phase 14 — Reusable tables.\*\* Finalize selection/bulk API on \`DataTable\`;

document usage for future logistics platform tables. Acceptance: one table system only.

\*\*Phase 15 — Reusable forms.\*\* Optional \`\<Form>\` context wrapper; document for

logistics forms. Acceptance: existing forms unaffected.

\*\*Phase 16 — Testing.\*\* Add tests for new primitives, command palette, table

selection, OTP UI; add first E2E (login→dashboard, permission-denied).

Acceptance: coverage of new surface; E2E green.

\*\*Phase 17 — Accessibility.\*\* Keyboard/focus/ARIA pass on palette, drawers,

menus, tabs; contrast in both themes. Acceptance: axe checks clean on new UI.

\*\*Phase 18 — Production hardening.\*\* Bundle-size review (ensure no AntD/mocks

leaked), perf, final lint/type/test/build. Acceptance: all quality gates pass.

\---

**## 23. Testing Strategy**

\- \*\*Unit:\*\* permission helpers, \`mapApiError\`, group-permissions, url-table-state,

each new UI primitive. _\_(Existing coverage present.)\__

\- \*\*Component:\*\* \`PermissionGate\`, \`ProtectedRoute\`, \`PermissionRoute\`, form

fields, command palette, table row-selection, OTP input.

\- \*\*Integration:\*\* login/logout/reset flows, API-client 401/refresh/timeout,

role assignment. _\_(Existing coverage present.)\__

\- \*\*E2E (new):\*\* login→dashboard, permission-denied redirect, role assignment,

session expiry — via Playwright against a running API + seeded DB.

Tooling: keep Vitest + RTL; add Playwright at Phase 16. Do not over-engineer E2E

before the enrichment UI stabilizes.

\---

**## 24. Quality Gates (per phase)**

Required (already wired in this repo): \*\*TypeScript\*\* (\`tsc --noEmit\`),

\*\*Lint\*\* (root flat ESLint, 0 errors), \*\*Formatting\*\* (Prettier via

lint-staged/pre-commit), \*\*Tests\*\* (Vitest), \*\*Production build\*\* (\`vite build\`).

Also, where applicable per phase: \*\*accessibility\*\* (keyboard/ARIA), \*\*responsive\*\*

(desktop→tablet→mobile), \*\*security\*\* (no secrets, no mock leakage), \*\*performance\*\*

(no bundle regressions — verify AntD/MSW never enter the graph).

\---

**## 25. Security Considerations**

\- Token handling: keep access token in the store; refresh token stays httpOnly

(never JS). Never log tokens.

\- \*\*Mock API leakage:\*\* the single biggest Slash-Admin-specific risk — MSW/Faker

must never be imported into \`apps/admin\`. Enforce via review + a dependency

check.

\- XSS: no \`dangerouslySetInnerHTML\`; a command palette/search must not render

untrusted HTML.

\- CSRF: refresh cookie is SameSite=Strict + path-scoped (backend-owned).

\- Env: only \`VITE\_\*\` (public). Authorization stays a backend responsibility.

\---

**## 26. Performance Considerations**

Keep route lazy-loading + manual vendor chunks (recharts isolated). Any adopted

dependency (cmdk, vaul, input-otp, radix tabs/tooltip) is small and should be

code-split with the feature that uses it. \*\*Reject\*\* heavy Slash Admin deps

(AntD, apexcharts, FullCalendar, react-quill, @dnd-kit) — they would dwarf the

current bundle. Keep server-side pagination; add table virtualization only for a

genuinely large non-paginated list.

\---

**## 27. Accessibility**

Maintain the current baseline (Radix primitives, labeled fields, \`aria-invalid\`,

\`role="alert"\`, focus rings, contrast-safe tokens). New adopted UI must be

keyboard-navigable: command palette (arrow/enter/escape), drawers/sheets (focus

trap + escape), tabs (arrow keys), OTP input (paste + arrow handling). Full WCAG

conformance requires manual screen-reader testing at Phase 17.

\---

**## 28. Risks**

\| Risk | Impact | Probability | Mitigation |

\| ----------------------------------------------------- | ------------------------- | -------------------- | ----------------------------------------------------------- |

\| Duplicate dependencies (AntD + shadcn, axios + fetch) | High (bundle + confusion) | Med if copying files | Adopt patterns only; forbid AntD/axios in review. |

\| Architecture divergence | High | Low | This doc is the single blueprint; keep feature-slice model. |

\| API duplication (2nd client / endpoints) | High | Low | One \`fetch\` client + \`@app/api-contracts\` only. |

\| Authentication mismatch | High | Low | Keep existing auth logic; adopt UI only; tests guard it. |

\| RBAC mismatch (\`{code}\` vs strings) | Med | Low | Keep string model + existing hooks. |

\| State duplication | Med | Low | Server=Query, client=Zustand, filters=URL (unchanged). |

\| UI duplication (two design systems) | High | Med if careless | Recreate primitives in existing stack; no AntD. |

\| Slash Admin coupling | Med | Low | Reference-only; never import from \`\_Reference\`. |

\| \*\*Mock API leakage (MSW/Faker) to prod\*\* | High | Low | Never import mocks; dependency check in CI. |

\| Future logistics scalability | Med | Low | \`modules/logistics/\*\` + reusable DataTable/forms (§32). |

\| Dependency bloat from "nice" widgets | Med | Med | Add a dep only when a phase needs it; bundle review. |

\---

**## 29. Definition of Done (for the integration effort)**

\- [ ] This document approved as the blueprint.

\- [ ] Any adopted primitive lives in \`components/ui\`, themed for light/dark, with a test.

\- [ ] No Ant Design, vanilla-extract, styled-components, axios, MSW, or Faker in \`apps/admin\` dependencies or import graph.

\- [ ] One API client + one endpoint source (\`@app/api-contracts\`) preserved.

\- [ ] Auth logic, RBAC model, and state boundaries unchanged (UI-only enrichments).

\- [ ] Existing 48 tests still pass; new UI has tests; first E2E flows added.

\- [ ] TypeScript, lint (0 errors), Prettier, and production build all pass.

\- [ ] Bundle review shows no heavy reference deps leaked; recharts still isolated.

\- [ ] Accessibility pass on new interactive UI.

\- [ ] \`modules/logistics/\*\` remains addable without structural change.

\- [ ] \`\_Reference/slash-admin\` untouched.

\---

**## 30. Final Recommendation**

**### Should Slash Admin be adopted?**

\*\*PARTIALLY\*\* — as a UI/UX pattern reference, recreated in the existing stack.

**### What should be adopted?**

Missing UI primitives (command palette, drawer/sheet, tabs, input-otp, tooltip);

a command-palette global search; a richer account dropdown + optional notice

menu; optional DataTable row-selection + bulk actions; an optional \`\<Form>\`

context wrapper; optionally i18n language auto-detect + locale picker and an

appearance settings drawer. All wired to the existing API/RBAC/theme systems.

**### What should remain from the existing Admin?**

The API client + \`@app/api-contracts\` integration; authentication logic + session

handling + refresh; the RBAC model, hooks, guards, and permission-filtered nav;

the reusable \`DataTable\`; the form primitives; the theme provider; i18n;

error handling (\`mapApiError\`/\`ErrorBoundary\`/\`ErrorState\`); the \`modules/\*\`

feature-slice structure; the Vitest suite and CI/hook quality gates.

**### What should NOT be copied?**

Ant Design, vanilla-extract, styled-components; axios + the mock \`apiClient\`/

services; MSW + Faker mocks; multi-tab shell + \`@dnd-kit\`; FullCalendar;

react-quill; apexcharts; the \`{code}\` permission model; username \`/auth/signin\`;

react-router-7 APIs; \`zh\_CN\` bundle; Biome/lefthook config.

**### What should be implemented first (next 3–5 phases)?**

1\. \*\*Phase 1\*\* — approve this audit as the blueprint.

2\. \*\*Phase 2\*\* — add missing UI primitives (command, drawer/sheet, tabs,

input-otp, tooltip) in the existing stack.

3\. \*\*Phase 3\*\* — layout/navigation polish (account dropdown, notice menu,

command-palette trigger).

4\. \*\*Phase 6\*\* — authentication UI enrichment (segmented OTP) with \*\*zero\*\* auth-

logic change.

5\. \*\*Phase 8\*\* — Users table affordances (row selection + bulk-action bar),

keeping create/edit/delete blocked on backend.

**### Is a rewrite required?**

\*\*NO.\*\* The existing architecture is not merely compatible — it already

implements the target design on a stack aligned with this monorepo and the real

Fastify backend. Slash Admin contributes incremental UI polish, nothing

structural.

\---

**## 31. Final Architecture Diagram (recommended, unchanged)**

\`\`\`text

                         SUPER ADMIN FRONTEND (apps/super-admin)

                              │

          ┌───────────────────┼───────────────────┐

          │                   │                   │

          ▼                   ▼                   ▼

       Routing              Layout              Theme

(route-config + (AdminLayout / (ThemeProvider,

    guards, lazy)        AuthLayout)         HSL tokens, l/d/system)

          │                   │                   │

          └───────────────────┼───────────────────┘

                              ▼

                       Feature Modules (modules/\*)

                              │

        ┌─────────────────────┼─────────────────────┐

        │          │          │          │           │

        ▼          ▼          ▼          ▼           ▼

      Auth       Users       Roles    Permissions  Settings   (+ future logistics platform/\*)

        │          │          │          │           │

        └──────────┴──────────┴──────────┴───────────┘

                              │

                              ▼

                    API Services (modules/\*/api)

                              │

                              ▼

              Central API Client (lib/api-client, fetch)

                              │

                              ▼

                   API Contracts (@app/api-contracts)

                              │

                              ▼

                         Fastify API (/api/v1)

                              │

              ┌───────────────┼───────────────┐

              ▼               ▼               ▼

             Auth             RBAC        Business Logic

                              │

                              ▼

                           Prisma

                              │

                              ▼

                         PostgreSQL

\`\`\`

\---

\_Deliverable of this phase: this document only. Nothing was implemented,

installed, renamed, removed, or modified in \`apps/admin\`, \`apps/api\`, \`packages\`,

\`prisma\`, or \`\_Reference/slash-admin\`.\_

---

# 32. Super Admin Scope Correction — Authoritative

The original audit language used **Admin** terminology and included future Logistics modules. For the Super Admin Platform, the following interpretation is authoritative.

## Product identity

```text
Super Admin = SaaS Control Plane
Tenant Admin = Customer/Tenant Administration
Logistics Admin = Operational Plane
```

## Super Admin navigation

```text
Dashboard

Tenants
├── All Tenants
├── Pending
├── Active
├── Suspended
└── Archived

Platform Access
├── Platform Users
├── Platform Roles
└── Platform Permissions

Tenant Lifecycle
└── Provisioning

Commercial
├── Plans
└── Entitlements

Platform Operations
├── System Health
├── Background Jobs
└── Integrations

Security
├── Audit Logs
├── Login Activity
├── Sessions
└── Security Events

Configuration
├── Feature Flags
├── Platform Settings
├── API Credentials
└── Platform Branding
```

## Tenant detail

Tenant detail is platform management, not tenant operations:

```text
Tenant
├── Overview
├── Lifecycle
├── Plan & Entitlements
├── Provisioning
├── Configuration
├── Branding
├── API Credentials
├── Integrations
├── Usage
├── Security
└── Audit
```

Do **not** add:

```text
Tenant → Shipments
Tenant → Orders
Tenant → Drivers
Tenant → Vehicles
Tenant → Routes
Tenant → Dispatch
Tenant → Warehouses
```

## Platform RBAC

Platform permissions must use a platform namespace:

```text
platform.dashboard.read
platform.tenant.read
platform.tenant.create
platform.tenant.update
platform.tenant.activate
platform.tenant.suspend
platform.user.read
platform.user.create
platform.user.update
platform.role.read
platform.role.manage
platform.permission.read
platform.audit.read
platform.security.read
platform.settings.read
platform.settings.update
platform.feature_flag.manage
platform.entitlement.manage
platform.credentials.manage
```

Tenant permissions such as `shipment.read` or `driver.update` are not Super Admin navigation permissions.

## API boundary

The frontend uses:

```text
apps/super-admin
      ↓
central API client
      ↓
@app/api-contracts
      ↓
apps/platform-api
      ↓
Platform DB
```

It must never:

```text
apps/super-admin
      ↓
Logistics DB
```

and must not import Logistics Prisma/services.

## Definition of Done for the Super Admin conversion

- [ ] Product is explicitly named and presented as Super Admin.
- [ ] `apps/super-admin` is the only frontend in this repository.
- [ ] Navigation is control-plane oriented.
- [ ] Tenant lifecycle is first-class.
- [ ] Platform users are separate from tenant users.
- [ ] Platform RBAC is separate from tenant RBAC.
- [ ] Plans and entitlements are platform concerns.
- [ ] Provisioning is first-class.
- [ ] Audit and security are first-class.
- [ ] API credentials are treated as sensitive platform resources.
- [ ] Platform settings are separate from tenant settings.
- [ ] No shipment/driver/vehicle/order/route/dispatch/warehouse modules exist here.
- [ ] No direct Logistics DB access exists.
- [ ] No second API client is introduced.
- [ ] Existing authentication/security contracts remain authoritative unless separately approved.
- [ ] Slash Admin is used only as a UI/UX reference.
