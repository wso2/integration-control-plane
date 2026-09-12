-- ============================================================================
-- Add SSO group mapping tables and effective membership views (MySQL / MariaDB)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sso_group_mappings (
    mapping_id VARCHAR(36) PRIMARY KEY,
    org_uuid INT NOT NULL DEFAULT 1,
    issuer VARCHAR(255) NOT NULL,
    claim_name VARCHAR(128) NOT NULL,
    claim_value VARCHAR(255) NOT NULL,
    group_id VARCHAR(36) NOT NULL,
    project_uuid CHAR(36) NULL,
    integration_uuid CHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sso_group_mapping_org FOREIGN KEY (org_uuid) REFERENCES organizations(org_id) ON DELETE CASCADE,
    CONSTRAINT fk_sso_group_mapping_group FOREIGN KEY (group_id) REFERENCES user_groups(group_id) ON DELETE CASCADE,
    CONSTRAINT fk_sso_group_mapping_project FOREIGN KEY (project_uuid) REFERENCES projects(project_id) ON DELETE CASCADE,
    CONSTRAINT fk_sso_group_mapping_integration FOREIGN KEY (integration_uuid) REFERENCES components(component_id) ON DELETE CASCADE,
    CONSTRAINT chk_sso_mapping_integration_requires_project
        CHECK (integration_uuid IS NULL OR project_uuid IS NOT NULL),
    UNIQUE KEY unique_sso_group_mapping (org_uuid, issuer, claim_name, claim_value, group_id),
    INDEX idx_sso_group_mapping_org (org_uuid),
    INDEX idx_sso_group_mapping_issuer_claim (issuer, claim_name, claim_value),
    INDEX idx_sso_group_mapping_group (group_id),
    INDEX idx_sso_group_mapping_project (project_uuid),
    INDEX idx_sso_group_mapping_integration (integration_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS federated_group_user_mapping (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    org_uuid INT NOT NULL DEFAULT 1,
    issuer VARCHAR(255) NOT NULL,
    user_uuid VARCHAR(36) NOT NULL,
    group_id VARCHAR(36) NOT NULL,
    claim_name VARCHAR(128) NOT NULL,
    claim_value VARCHAR(255) NOT NULL,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fed_group_user_org FOREIGN KEY (org_uuid) REFERENCES organizations(org_id) ON DELETE CASCADE,
    CONSTRAINT fk_fed_group_user_user FOREIGN KEY (user_uuid) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_fed_group_user_group FOREIGN KEY (group_id) REFERENCES user_groups(group_id) ON DELETE CASCADE,
    UNIQUE KEY unique_fed_group_user_claim (org_uuid, issuer, user_uuid, group_id, claim_name, claim_value),
    INDEX idx_fed_group_user_user (user_uuid),
    INDEX idx_fed_group_user_group (group_id),
    INDEX idx_fed_group_user_issuer_claim (issuer, claim_name, claim_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- EFFECTIVE GROUP MEMBERSHIP VIEWS
-- ============================================================================

DROP VIEW IF EXISTS v_user_environment_access;
DROP VIEW IF EXISTS v_user_integration_access;
DROP VIEW IF EXISTS v_user_project_access;
DROP VIEW IF EXISTS v_effective_group_user_mapping;

CREATE OR REPLACE VIEW v_effective_group_user_mapping AS
SELECT user_uuid, group_id
FROM group_user_mapping
UNION
SELECT user_uuid, group_id
FROM federated_group_user_mapping;

CREATE OR REPLACE VIEW v_user_project_access AS
SELECT DISTINCT
    gum.user_uuid,
    grm.project_uuid,
    p.name AS project_name,
    p.org_id AS org_uuid,
    grm.role_id,
    'project' AS access_level
FROM v_effective_group_user_mapping gum
INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
INNER JOIN projects p ON grm.project_uuid = p.project_id
WHERE grm.project_uuid IS NOT NULL AND grm.integration_uuid IS NULL
UNION
SELECT DISTINCT
    gum.user_uuid,
    p.project_id AS project_uuid,
    p.name AS project_name,
    p.org_id AS org_uuid,
    grm.role_id,
    'org' AS access_level
FROM v_effective_group_user_mapping gum
INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
INNER JOIN projects p ON grm.org_uuid = p.org_id
WHERE grm.org_uuid IS NOT NULL
  AND grm.project_uuid IS NULL
  AND grm.integration_uuid IS NULL
UNION
SELECT DISTINCT
    gum.user_uuid,
    grm.project_uuid,
    p.name AS project_name,
    p.org_id AS org_uuid,
    grm.role_id,
    'integration' AS access_level
FROM v_effective_group_user_mapping gum
INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
INNER JOIN projects p ON grm.project_uuid = p.project_id
WHERE grm.integration_uuid IS NOT NULL;

CREATE OR REPLACE VIEW v_user_integration_access AS
SELECT DISTINCT
    gum.user_uuid,
    grm.integration_uuid,
    c.name AS integration_name,
    c.project_id AS project_uuid,
    grm.env_uuid,
    grm.role_id,
    'integration' AS access_level
FROM v_effective_group_user_mapping gum
INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
INNER JOIN components c ON grm.integration_uuid = c.component_id
WHERE grm.integration_uuid IS NOT NULL
UNION
SELECT DISTINCT
    gum.user_uuid,
    c.component_id AS integration_uuid,
    c.name AS integration_name,
    c.project_id AS project_uuid,
    grm.env_uuid,
    grm.role_id,
    'project' AS access_level
FROM v_effective_group_user_mapping gum
INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
INNER JOIN components c ON grm.project_uuid = c.project_id
WHERE grm.project_uuid IS NOT NULL
  AND grm.integration_uuid IS NULL
UNION
SELECT DISTINCT
    gum.user_uuid,
    c.component_id AS integration_uuid,
    c.name AS integration_name,
    c.project_id AS project_uuid,
    grm.env_uuid,
    grm.role_id,
    'org' AS access_level
FROM v_effective_group_user_mapping gum
INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
INNER JOIN projects p ON grm.org_uuid = p.org_id
INNER JOIN components c ON p.project_id = c.project_id
WHERE grm.org_uuid IS NOT NULL
  AND grm.project_uuid IS NULL
  AND grm.integration_uuid IS NULL;

CREATE OR REPLACE VIEW v_user_environment_access AS
SELECT DISTINCT
    gum.user_uuid,
    grm.env_uuid,
    grm.project_uuid,
    grm.integration_uuid,
    grm.role_id,
    CASE
        WHEN grm.integration_uuid IS NOT NULL THEN 'integration'
        WHEN grm.project_uuid IS NOT NULL THEN 'project'
        ELSE 'org'
    END AS scope_level
FROM v_effective_group_user_mapping gum
INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
WHERE grm.env_uuid IS NOT NULL OR grm.org_uuid IS NOT NULL;
