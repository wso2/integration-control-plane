-- Migration: runtime retirement marker (PostgreSQL)
-- Adds runtimes.retired_at, set when a restarting runtime takes over the name its previous
-- instance held. The superseded row is kept as a tombstone so its runtime ID still resolves,
-- which is what stops that instance — often still alive inside its termination grace period —
-- from taking the name back off its replacement. NULL for every live runtime.
-- Idempotent - safe to re-run. Fresh installs get this from postgresql_init.sql.
-- Run once against the main ICP DB.

ALTER TABLE runtimes ADD COLUMN IF NOT EXISTS retired_at TIMESTAMP NULL;
