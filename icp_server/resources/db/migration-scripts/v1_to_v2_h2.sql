-- ============================================================================
-- ICP v2 Schema Update Script (H2) — Composite App Changes
-- ============================================================================
--
-- SCOPE NOTE
-- ----------
-- This script brings an existing ICP v2 H2 database up to date with the
-- schema changes introduced in PR #634 ("Change terminology from
-- `carbon app` to `composite app`"):
--   - New table: mi_composite_app_artifacts
--   - New table: org_secrets (plus runtimes.key_id column)
--
-- It is intended for deployments that initialised their v2 database using an
-- earlier version of h2_init.sql, before these tables were added.
-- A brand-new install using the current h2_init.sql already has everything
-- below and does not need this script.
--
-- OUT OF SCOPE
-- ------------
-- The equivalent MySQL/MSSQL scripts (v1_to_v2_mysql.sql, v1_to_v2_mssql.sql)
-- also perform user/credential/group migration from a legacy ICP v1
-- (UM_USER-based) database. That migration relies on same-server
-- cross-database table references. H2 is typically run as a single embedded
-- database per deployment, so migrating from a separate old H2 file would
-- require linked tables or a separate connection per database rather than
-- a single script. Rather than port that logic unverified, this script only
-- covers the schema/DDL changes. User migration for PostgreSQL/H2 is tracked
-- as a separate follow-up.
--
-- PREREQUISITES
-- -------------
-- 1. Run against the ICP v2 H2 database, already initialised using
--    h2_init.sql.
-- 2. The database user must have CREATE/ALTER privileges.
--
-- USAGE
-- -----
--   java -cp h2*.jar org.h2.tools.RunScript \
--     -url jdbc:h2:./icp_db -user sa -script v1_to_v2_h2.sql
--
--   (or run interactively through the H2 Console)
-- ============================================================================

-- ============================================================================
-- STEP 1 — Create org_secrets table (if not already present)
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_secrets (
    key_id         VARCHAR(16)  NOT NULL,
    environment_id CHAR(36)     NOT NULL,
    key_material   VARCHAR(256) NOT NULL,
    project_id     CHAR(36)     NULL,
    component_id   CHAR(36)     NULL,
    project_handler VARCHAR(255) NULL,
    component_name  VARCHAR(255) NULL,
    runtime_type    VARCHAR(8)   NULL CHECK (runtime_type IN ('MI', 'BI')),
    bound_at       TIMESTAMP    NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by     CHAR(36)     NULL,
    PRIMARY KEY (key_id),
    CONSTRAINT fk_org_secrets_project     FOREIGN KEY (project_id)     REFERENCES projects (project_id)          ON DELETE CASCADE,
    CONSTRAINT fk_org_secrets_component   FOREIGN KEY (component_id)   REFERENCES components (component_id)      ON DELETE CASCADE,
    CONSTRAINT fk_org_secrets_environment FOREIGN KEY (environment_id) REFERENCES environments (environment_id)  ON DELETE CASCADE,
    CONSTRAINT fk_org_secrets_created_by  FOREIGN KEY (created_by)     REFERENCES users (user_id)                ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_org_secrets_environment ON org_secrets (environment_id);

-- ============================================================================
-- STEP 2 — Add key_id column to runtimes (if not already present)
-- ============================================================================
ALTER TABLE runtimes ADD COLUMN IF NOT EXISTS key_id VARCHAR(16);

-- ============================================================================
-- STEP 3 — Create mi_composite_app_artifacts table (if not already present)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mi_composite_app_artifacts (
    runtime_id CHAR(36) NOT NULL,
    app_name VARCHAR(200) NOT NULL,
    version VARCHAR(50),
    state VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (state IN ('Active', 'Faulty')),
    error_message CLOB,             -- Error message when state is Faulty
    artifacts VARCHAR(4000),        -- JSON array serialized as string
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, app_name),
    CONSTRAINT fk_mi_composite_app_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mi_composite_app_artifacts_runtime_id ON mi_composite_app_artifacts (runtime_id);
CREATE INDEX IF NOT EXISTS idx_mi_composite_app_artifacts_app_name ON mi_composite_app_artifacts (app_name);
CREATE INDEX IF NOT EXISTS idx_mi_composite_app_artifacts_state ON mi_composite_app_artifacts (state);

-- ============================================================================
-- STEP 4 — Add key_id foreign key constraint on runtimes
-- ============================================================================
--
-- NOTE: not guarded with an existence check — H2 does not support
-- conditional constraint creation. This matches the same non-idempotent
-- behaviour as the equivalent ALTER in v1_to_v2_mysql.sql. Placed last so
-- that if this statement fails on a rerun (constraint already exists),
-- all the idempotent table/index creation above has already completed
-- successfully. Safe to ignore an error on this line on a second run.

ALTER TABLE runtimes
    ADD CONSTRAINT fk_runtime_key_id FOREIGN KEY (key_id)
        REFERENCES org_secrets (key_id) ON DELETE SET NULL;


-- No trigger for updated_at: consistent with h2_init.sql, which does not
-- use database-level triggers for updated_at maintenance on any table
-- (H2's trigger API requires a Java class, unlike MySQL/Postgres/MSSQL's
-- inline SQL triggers, so this project handles updated_at at the
-- application layer for H2 instead).

-- ============================================================================
-- DONE
-- ============================================================================

-- H2 does not support \echo; these are plain comments for anyone reading
-- the script output/log rather than runtime messages.
-- Schema update complete. User/credential/group migration from ICP v1 is
-- not handled by this script — see migration-scripts/README.md.