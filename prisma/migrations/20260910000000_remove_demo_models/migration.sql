-- ── Remove demo models (Todo, Example) — Phase 14 ────────────────────────────
-- The demo/reference modules (todos, example, orders) were removed from the
-- application. Their backing tables are dropped here.
--
-- DESTRUCTIVE: this drops the `todos` and `examples` tables and all their data.
--
-- NOTE: This migration is authored but intentionally NOT executed as part of
-- Phase 14. Apply it deliberately (never automatically) after verifying
-- DATABASE_URL points at the Platform DB and that no needed data lives in these
-- tables. See docs/CONVERSION-INVENTORY.md / docs/TARGET-STRUCTURE.md.

DROP TABLE IF EXISTS "todos";
DROP TABLE IF EXISTS "examples";
