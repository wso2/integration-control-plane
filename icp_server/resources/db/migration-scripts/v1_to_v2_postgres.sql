-- ============================================================================
-- ICP v2 Schema Update Script (PostgreSQL) — Composite App Changes
-- ============================================================================
--
-- SCOPE NOTE
-- ----------
-- This script brings an existing ICP v2 PostgreSQL database up to date with
-- the schema changes introduced in PR #634 ("Change terminology from
-- `carbon app` to `composite app`"):
--   - New table: mi_composite_app_artifacts
--   - New table: org_secrets (plus runtimes.key_id column)
--
-- It is intended for deployments that initialised their v2 database using an
-- earlier version of postgresql_init.sql, before these tables were added.
-- A brand-new install using the current postgresql_init.sql already has
-- everything below and does not need this script.
--
-- OUT OF SCOPE
-- ------------
-- The equivalent MySQL/MSSQL scripts (v1_to_v2_mysql.sql, v1_to_v2_mssql.sql)
-- also perform user/credential/group migration from a legacy ICP v1
-- (UM_USER-based) database. That migration relies on same-server
-- cross-database table references, which PostgreSQL does not support
-- natively — it would require the postgres_fdw or dblink extension to
-- bridge across databases. Rather than port that logic unverified, this
-- script only covers the schema/DDL changes. User migration for
-- PostgreSQL/H2 is tracked as a separate follow-up.
--
-- PREREQUISITES
-- -------------
-- 1. Run against the ICP v2 main database (icp_db), already initialised
--    using postgresql_init.sql.
-- 2. The database user must have CREATE/ALTER privileges on this database.
--
-- USAGE
-- -----
--   psql -U <user> -d icp_db -f v1_to_v2_postgres.sql
-- ============================================================================

\echo 'Starting ICP v2 schema update (composite app changes) ...'

-- ============================================================================
-- STEP 1 — Create org_secrets table (if not already present)
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_secrets (
    key_id          VARCHAR(16)  NOT NULL,
    environment_id  CHAR(36)     NOT NULL,
    key_material    VARCHAR(256) NOT NULL,
    project_id      CHAR(36)     NULL,
    component_id    CHAR(36)     NULL,
    project_handler VARCHAR(255) NULL,
    component_name  VARCHAR(255) NULL,
    runtime_type    VARCHAR(8)   NULL CHECK (runtime_type IN ('MI', 'BI')),
    bound_at        TIMESTAMP    NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      CHAR(36)     NULL,
    PRIMARY KEY (key_id),
    CONSTRAINT fk_org_secrets_project     FOREIGN KEY (project_id)     REFERENCES projects (project_id)         ON DELETE CASCADE,
    CONSTRAINT fk_org_secrets_component   FOREIGN KEY (component_id)   REFERENCES components (component_id)     ON DELETE CASCADE,
    CONSTRAINT fk_org_secrets_environment FOREIGN KEY (environment_id) REFERENCES environments (environment_id) ON DELETE CASCADE,
    CONSTRAINT fk_org_secrets_created_by  FOREIGN KEY (created_by)     REFERENCES users (user_id)                ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_org_secrets_environment ON org_secrets (environment_id);

\echo 'org_secrets table ensured.'

-- ============================================================================
-- STEP 2 — Add key_id column to runtimes (if not already present)
-- ============================================================================

ALTER TABLE runtimes ADD COLUMN IF NOT EXISTS key_id VARCHAR(16) NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_runtime_key_id'
    ) THEN
        ALTER TABLE runtimes
            ADD CONSTRAINT fk_runtime_key_id FOREIGN KEY (key_id)
                REFERENCES org_secrets (key_id) ON DELETE SET NULL;
    END IF;
END $$;

\echo 'runtimes.key_id column ensured.'

-- ============================================================================
-- STEP 3 — Create mi_composite_app_artifacts table (if not already present)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mi_composite_app_artifacts (
    runtime_id CHAR(36) NOT NULL,
    app_name VARCHAR(200) NOT NULL,
    version VARCHAR(50) NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (state IN ('Active', 'Faulty')),
    error_message TEXT NULL,             -- Error message when state is Faulty
    artifacts VARCHAR(4000) NULL,        -- JSON array serialized as string
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, app_name),
    CONSTRAINT fk_mi_composite_app_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rca_runtime_id ON mi_composite_app_artifacts (runtime_id);
CREATE INDEX IF NOT EXISTS idx_rca_app_name ON mi_composite_app_artifacts (app_name);
CREATE INDEX IF NOT EXISTS idx_rca_state ON mi_composite_app_artifacts (state);

-- update_updated_at_column() is created by the initial postgresql_init.sql
-- and already exists in any running v2 database (it's used by `runtimes`
-- and other pre-existing tables), so it is not recreated here.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_mi_composite_app_artifacts_updated_at'
    ) THEN
        CREATE TRIGGER update_mi_composite_app_artifacts_updated_at
            BEFORE UPDATE ON mi_composite_app_artifacts
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

\echo 'mi_composite_app_artifacts table ensured.'

-- ============================================================================
-- DONE
-- ============================================================================

\echo '================================================================'
\echo 'PostgreSQL schema update complete.'
\echo 'NOTE: user/credential/group migration from ICP v1 is not handled'
\echo 'by this script. See migration-scripts/README.md for details.'
\echo '================================================================'