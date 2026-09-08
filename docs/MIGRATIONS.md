# Database Migrations — Expand / Contract

Zero-downtime deploys run **two versions of the app at once** during a rolling
release. A migration runs _before_ the new code is fully rolled out, so the
schema must stay compatible with the **old** code that's still serving traffic.

The rule: **every migration must be backward compatible with the currently
deployed version.** Breaking changes are split across releases using the
Expand / Contract pattern.

---

## What is "breaking"?

These break the old app version during a rolling deploy and must **not** ship as
a single migration:

| Change                           | Why it breaks                                |
| -------------------------------- | -------------------------------------------- |
| Rename a column/table            | Old code reads/writes the old name → errors  |
| Change a column type             | Old code sends the old type → errors         |
| Add `NOT NULL` without a default | Old code inserts without the column → errors |
| Drop a column/table still in use | Old code references it → errors              |

Safe (additive) changes that can ship in one migration:

- Add a **nullable** column
- Add a new table
- Add an index (use `CONCURRENTLY` on large tables)
- Widen a constraint (e.g. increase a length limit)

---

## The pattern: Expand → Migrate → Contract

Split a breaking change across **three deploys**.

### Worked example: rename `users.name` → `users.full_name`

**Deploy 1 — Expand (additive)**

```sql
-- Add the new column alongside the old one. Both exist.
ALTER TABLE "users" ADD COLUMN "full_name" TEXT;
```

New code writes to **both** columns and reads from `full_name` (falling back to
`name`). Old code keeps using `name` — still present, still works.

**Deploy 2 — Migrate (backfill)**

```sql
-- Copy existing data into the new column.
UPDATE "users" SET "full_name" = "name" WHERE "full_name" IS NULL;
```

Run as a migration or a one-off job. After this, `full_name` is fully populated.
Now new code can read `full_name` exclusively and stop writing `name`.

**Deploy 3 — Contract (remove old)**

Only after **every running instance** is on the code that no longer touches
`name`:

```sql
ALTER TABLE "users" DROP COLUMN "name";
```

---

## Prisma specifics

- Prisma migrations run against `DATABASE_DIRECT_URL` (a direct, non-pooled
  session) — pooled connections through PgBouncer can't run the session-level
  commands migrations use. See `prisma/schema.prisma` `directUrl`.
- Prisma renames are destructive by default (`DROP` + `ADD`). For a rename,
  hand-edit the generated migration SQL to `ADD COLUMN` + backfill + (later)
  `DROP COLUMN` across separate migrations rather than accepting the default.
- Mark breaking migration SQL with a comment so reviewers catch it:

  ```sql
  -- BREAKING: requires Expand/Contract — do not deploy alongside old app version
  ```

## Multi-instance migration execution

Run migrations as a **separate step** in the deploy pipeline (a job/initContainer),
not inside every app instance at boot. Two instances running `prisma migrate
deploy` simultaneously race on the advisory lock; one will hang or fail.

## Checklist (also in the PR template)

- [ ] No migration, **or**
- [ ] Migration is backward compatible with the deployed version, **or**
- [ ] This is an Expand step (additive only), **or**
- [ ] This is a Contract step and the Expand shipped in a prior release
