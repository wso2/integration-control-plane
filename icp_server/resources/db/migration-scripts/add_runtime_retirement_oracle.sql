-- Migration: runtime retirement marker (Oracle (19c+))
-- Adds runtimes.retired_at, set when a restarting runtime takes over the name its previous
-- instance held. The superseded row is kept as a tombstone so its runtime ID still resolves,
-- which is what stops that instance — often still alive inside its termination grace period —
-- from taking the name back off its replacement. NULL for every live runtime.
-- Idempotent - safe to re-run. Fresh installs get this from oracle_init.sql.
-- Run once against the main ICP DB.

-- ORA-01430 = column already exists in the table; ignored for idempotency
DECLARE
    e_column_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_column_exists, -1430);
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE runtimes ADD retired_at TIMESTAMP(6) NULL';
EXCEPTION
    WHEN e_column_exists THEN NULL;
END;
/
