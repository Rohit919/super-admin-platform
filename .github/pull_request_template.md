## Summary

<!-- What does this PR change and why? -->

## Changes

<!-- Bullet the notable changes. -->

-

## Testing

<!-- How was this verified? -->

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes

## Database migrations

If this PR includes a Prisma migration, confirm one of:

- [ ] No migration in this PR
- [ ] Migration is **backward compatible** with the currently-deployed version
- [ ] This is an **Expand** step (additive only — new nullable columns / tables)
- [ ] This is a **Contract** step, and the Expand step shipped in a prior release

> Renames, type changes, and `NOT NULL` without a default are breaking during a
> rolling deploy. Use the Expand/Contract pattern (see docs).

## Security

- [ ] No secrets committed (`.env`, tokens, keys)
- [ ] Auth/authorization changes reviewed
