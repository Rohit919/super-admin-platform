# Runbook — Super Admin Account Compromise

A platform (Super Admin) account is suspected compromised. Goal: cut off access
immediately, invalidate sessions, rotate credentials, and audit blast radius.

Background: platform access requires an **ACTIVE `PlatformMembership`** AND a
platform role granting `platform.*` permissions. Removing either revokes
control-plane access. Sessions are: short-lived access JWT (~15m) + an
httpOnly refresh cookie with rotation + family reuse detection.

## 1. Contain access (fastest lever first)

Suspend the compromised user's platform membership so every `/platform/*` call
is refused (`403 PLATFORM_ACCESS_DENIED`). Set the membership status to a
non-ACTIVE value (e.g. `SUSPENDED`). The membership gate re-checks on every
request, so this takes effect on the next call — no deploy needed.

If you cannot reach the UI, do it at the data layer against the correct DB:
suspend the row in `platform_memberships` for that `userId` (never run ad-hoc
destructive SQL without the migration runbook's target-verification step).

## 2. Invalidate sessions & credentials

- **Revoke all refresh tokens** for the user (forces re-login everywhere). The
  `logout-all` / password-reset flows revoke every active refresh token; a
  forced password reset also bumps `passwordChangedAt` and clears lockout.
- **Force a password reset** for the account and require re-verification.
- If the account also held tenant API credential management and those may be
  exposed, follow `credential-compromise.md` for affected tenants.

## 3. Assess blast radius via audit

Review the audit log for actions taken by the compromised actor:

```
GET /api/v1/platform/audit?action=<...>      # filter by high-value actions
```

Look especially for: tenant lifecycle changes, role/permission changes, plan or
entitlement changes, and credential create/rotate/revoke. Reverse any
unauthorized changes through the normal (audited) endpoints.

## 4. Restore access deliberately

Only after the account is secured (new password, verified identity), restore the
`PlatformMembership` to `ACTIVE`. Re-grant platform roles only as needed
(least privilege). `SUPER_ADMIN` is break-glass — assign sparingly.

## 5. Rotate shared secrets if warranted

If the compromise could have exposed server secrets (e.g. `JWT_SECRET`), rotate
them via the secrets provider and redeploy. Rotating `JWT_SECRET` invalidates
all existing access tokens platform-wide.

## Post-incident

- [ ] Membership suspended during containment; restored deliberately after.
- [ ] All sessions invalidated; password reset completed.
- [ ] Audit reviewed; unauthorized changes reversed.
- [ ] Shared secrets rotated if exposure was possible.
- [ ] Timeline + actions recorded.
