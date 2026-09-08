-- Migration: tunneled-operation table (MySQL 8+)
--
-- One generic table the control plane uses to answer read requests without holding one open
-- and to queue the mutations that change something: tunneled_operation. It knows nothing of
-- workflows - `kind` says what a row is about, `cacheable` whether it is a re-servable read or
-- a one-shot mutation, and `data` carries the rest.
--
-- The `cache_`-era contract still holds: this is DERIVED state. The table may be dropped and
-- recreated on any upgrade and nothing needs migrating - losing a row costs one refetch, or
-- one caller being told their operation was never confirmed. That is also why this script
-- only creates it.
--
-- Idempotent - safe to re-run. Fresh installs get all of this from mysql_init.sql.
-- MySQL has no CREATE INDEX IF NOT EXISTS, so the indexes are declared in the table.

CREATE TABLE IF NOT EXISTS tunneled_operation (
    op_id VARCHAR(100) NOT NULL,
    kind VARCHAR(64) NOT NULL,
    cacheable BOOLEAN NOT NULL,
    owner VARCHAR(200) NOT NULL,
    target VARCHAR(36),
    token VARCHAR(36),
    status VARCHAR(16) NOT NULL,
    issued_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    claimed_at BIGINT,
    delivered_at BIGINT,
    completed_at BIGINT,
    data LONGTEXT,
    result LONGTEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (op_id),
    KEY idx_tunop_read_claim (owner, token, claimed_at),
    KEY idx_tunop_mutation_claim (target, status, issued_at),
    KEY idx_tunop_expiry (expires_at),
    KEY idx_tunop_cleanup (status, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
