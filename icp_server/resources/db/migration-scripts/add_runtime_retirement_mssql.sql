-- Migration: runtime retirement marker (Microsoft SQL Server)
-- Adds runtimes.retired_at, set when a restarting runtime takes over the name its previous
-- instance held. The superseded row is kept as a tombstone so its runtime ID still resolves,
-- which is what stops that instance — often still alive inside its termination grace period —
-- from taking the name back off its replacement. NULL for every live runtime.
-- Idempotent - safe to re-run. Fresh installs get this from mssql_init.sql.
-- Run once against the main ICP DB.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'runtimes') AND name = N'retired_at')
    ALTER TABLE runtimes ADD retired_at DATETIME2 (6) NULL;
GO
