-- Migration: tunneled-operation table (MSSQL 2019+)
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
-- Idempotent - safe to re-run. Fresh installs get all of this from mssql_init.sql.

IF OBJECT_ID('tunneled_operation', 'U') IS NULL
CREATE TABLE tunneled_operation (
    op_id NVARCHAR(100) NOT NULL,
    kind NVARCHAR(64) NOT NULL,
    cacheable BIT NOT NULL,
    owner NVARCHAR(200) NOT NULL,
    target NVARCHAR(36),
    token NVARCHAR(36),
    status NVARCHAR(16) NOT NULL,
    issued_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    claimed_at BIGINT,
    delivered_at BIGINT,
    completed_at BIGINT,
    data NVARCHAR(MAX),
    result NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (op_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_tunop_read_claim' AND object_id = OBJECT_ID('tunneled_operation'))
CREATE INDEX idx_tunop_read_claim ON tunneled_operation (owner, token, claimed_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_tunop_mutation_claim' AND object_id = OBJECT_ID('tunneled_operation'))
CREATE INDEX idx_tunop_mutation_claim ON tunneled_operation (target, status, issued_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_tunop_expiry' AND object_id = OBJECT_ID('tunneled_operation'))
CREATE INDEX idx_tunop_expiry ON tunneled_operation (expires_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_tunop_cleanup' AND object_id = OBJECT_ID('tunneled_operation'))
CREATE INDEX idx_tunop_cleanup ON tunneled_operation (status, completed_at);
