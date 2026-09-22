-- Migration: runtime retirement marker (MySQL / MariaDB)
-- Adds runtimes.retired_at, set when a restarting runtime takes over the name its previous
-- instance held. The superseded row is kept as a tombstone so its runtime ID still resolves,
-- which is what stops that instance — often still alive inside its termination grace period —
-- from taking the name back off its replacement. NULL for every live runtime.
-- Idempotent - safe to re-run. Fresh installs get this from mysql_init.sql.
-- Run once against the main ICP DB.

-- MySQL has no ADD COLUMN IF NOT EXISTS; 1060 = duplicate column, ignored for idempotency.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'runtimes' AND COLUMN_NAME = 'retired_at');
SET @ddl := IF(@exists = 0, 'ALTER TABLE runtimes ADD COLUMN retired_at TIMESTAMP(6) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
