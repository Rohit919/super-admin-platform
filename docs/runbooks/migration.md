# Runbook — Platform DB Migration

Applying Prisma migrations to the Platform PostgreSQL database. The app schema
is `prisma/schema.prisma`; migrations live in `prisma/migrations/`.

## Preconditions

- [ ] You know **which** environment you are targeting (local / staging / production).
- [ ] `DATABASE_URL` and `DATABASE_DIRECT_URL` resolve to that environment's DB.
      Migrations use the **direct** (non-pooled) URL.
- [ ] For production: a **verified, recent backup** exists and human approval is granted.
- [ ] You have reviewed the pending migration SQL and classified it
      (additive vs destructive).

## 1. Verify the target (read-only)

```bash
# Confirm host/db WITHOUT printing credentials.
grep -E '^(DATABASE_URL|DATABASE_DIRECT_URL|NODE_ENV)=' .env \
  | sed -E 's#(postgres(ql)?://)[^@]*@#\1***:***@#g'

# Show applied vs pending migrations (read-only; does not modify the DB).
npx prisma migrate status
```

Stop and reconsider if the target DB name or environment is not what you expect.

## 2. Review the migration SQL

- Inspect each pending `prisma/migrations/<name>/migration.sql`.
- Flag any destructive operation (`DROP TABLE`, `DROP COLUMN`, `ALTER ... DROP`,
  data-loss `UPDATE`/`DELETE`). Destructive migrations require a backup and
  explicit approval before proceeding.

## 3. Back up (production / any DB with real data)

Take and **verify** a logical or physical backup per the provider's procedure
before applying a destructive migration. A backup that has not been restored is
not proven — see `docs/DISASTER_RECOVERY.md`.

## 4. Apply

```bash
# Production / non-dev: apply already-authored migrations (no shadow DB).
npx prisma migrate deploy
```

Do **not** use `prisma migrate dev`, `prisma db push`, or `prisma migrate reset`
against a shared/production DB — those can author or reset schema destructively.

> Note: `migrate dev` uses a shadow database and replays the full migration
> history; a pre-existing ordering quirk in an older migration can make it fail
> in this repo. For authoring a new migration locally, prefer generating the SQL
> with `prisma migrate diff` and applying via `migrate deploy`.

## 5. Verify

```bash
npx prisma migrate status          # expect "Database schema is up to date!"
npx prisma generate                # regenerate the client if models changed
npm run test --workspace @app/api  # confirm the app still passes against the schema
```

Spot-check that intended tables/indexes/constraints exist and no unintended
tables were dropped.

## 6. Rollback / recovery

Prisma migrations are forward-only. To recover from a bad migration:

1. Stop writes if data integrity is at risk.
2. Restore from the pre-migration backup (see `docs/DISASTER_RECOVERY.md`).
3. Author a corrective forward migration rather than editing history.

## Post-migration

- [ ] `migrate status` clean.
- [ ] App tests/build green.
- [ ] Change recorded (what was applied, when, by whom, backup reference).
