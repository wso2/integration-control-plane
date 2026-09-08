-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================

CREATE TABLE organizations (
    org_id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    org_name VARCHAR(255) NOT NULL UNIQUE,
    org_handle VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_org_handle (org_handle)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ============================================================================
-- USER MANAGEMENT & AUTHZ
-- ============================================================================

CREATE TABLE users (
    user_id CHAR(36) NOT NULL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_project_author BOOLEAN NOT NULL DEFAULT FALSE,
    is_oidc_user BOOLEAN NOT NULL DEFAULT FALSE,
    require_password_change BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_super_admin (is_super_admin),
    INDEX idx_project_author (is_project_author)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ============================================================================
-- REFRESH TOKENS (for authentication session management)
-- ============================================================================

CREATE TABLE refresh_tokens (
    token_id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE, -- SHA256 hash of token
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMP NULL,
    user_agent VARCHAR(500) NULL,
    ip_address VARCHAR(50) NULL,
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_token_hash (token_hash),
    INDEX idx_expires_at (expires_at),
    INDEX idx_revoked (revoked)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ============================================================================
-- PROJECTS / COMPONENTS / ENVIRONMENTS
-- ============================================================================

CREATE TABLE projects (
    project_id CHAR(36) PRIMARY KEY,
    org_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    version VARCHAR(50) NULL DEFAULT '1.0.0',
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    handler VARCHAR(200) NOT NULL,
    region VARCHAR(100) NULL,
    description TEXT,
    default_deployment_pipeline_id CHAR(36) NULL,
    deployment_pipeline_ids JSON NULL,
    type VARCHAR(50) NULL,
    git_provider VARCHAR(50) NULL,
    git_organization VARCHAR(200) NULL,
    repository VARCHAR(200) NULL,
    branch VARCHAR(100) NULL,
    secret_ref VARCHAR(200) NULL,
    owner_id CHAR(36) NULL, -- User ID of the project owner
    created_by VARCHAR(200) NULL, -- Display name of who created the project
    updated_by VARCHAR(200) NULL, -- Display name of who last updated the project
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_projects_org FOREIGN KEY (org_id) REFERENCES organizations (org_id) ON DELETE RESTRICT,
    UNIQUE KEY uk_project_name_org (org_id, name), -- Allow same name in different orgs
    UNIQUE KEY uk_project_handler_org (org_id, handler), -- Enforce unique handler per org
    INDEX idx_owner_id (owner_id),
    INDEX idx_org_id (org_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Components belong to projects; users create components.
CREATE TABLE components (
    component_id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    name VARCHAR(150) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT NULL,
    component_type ENUM('MI', 'BI') NOT NULL DEFAULT 'BI',
    display_type VARCHAR(50) NOT NULL DEFAULT 'service',
    component_sub_type VARCHAR(50) NULL,
    created_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by CHAR(36) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_components_project FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_components_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_components_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE SET NULL,
    -- Prevent duplicate component names within the same project
    UNIQUE KEY uk_component_project_name (project_id, name),
    INDEX idx_project_id (project_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Moesif metrics configuration for a component (kept separate from components to
-- isolate provider secrets and avoid sparse columns on the core table).
CREATE TABLE component_moesif_config (
    component_id CHAR(36) PRIMARY KEY,
    dashboards_created BOOLEAN NOT NULL DEFAULT FALSE,
    workspace_id VARCHAR(512) NULL,
    management_key VARCHAR(4096) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_moesif_config_component FOREIGN KEY (component_id) REFERENCES components (component_id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE environments (
    environment_id CHAR(36) PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE, -- e.g., dev, stage, prod
    handler VARCHAR(200) NOT NULL UNIQUE,
    description TEXT NULL,
    region VARCHAR(100) NULL,
    cluster_id VARCHAR(200) NULL,
    choreo_env VARCHAR(50) NULL,
    external_apim_env_name VARCHAR(200) NULL,
    internal_apim_env_name VARCHAR(200) NULL,
    sandbox_apim_env_name VARCHAR(200) NULL,
    critical BOOLEAN NOT NULL DEFAULT FALSE,
    dns_prefix VARCHAR(100) NULL,
    created_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by CHAR(36) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_environments_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_environments_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ============================================================================
-- ============================================================================
-- RBAC V2 - GROUP-BASED AUTHORIZATION
-- ============================================================================

-- User Groups table
CREATE TABLE user_groups (
    group_id VARCHAR(36) PRIMARY KEY,
    group_name VARCHAR(255) NOT NULL,
    org_uuid INT NOT NULL DEFAULT 1,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_groups_org FOREIGN KEY (org_uuid) REFERENCES organizations(org_id) ON DELETE CASCADE,
    CONSTRAINT unique_group_name_org UNIQUE (group_name, org_uuid),
    INDEX idx_org_uuid (org_uuid),
    INDEX idx_group_name (group_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roles v2 table (new structure for permission-based RBAC)
CREATE TABLE roles_v2 (
    role_id VARCHAR(36) PRIMARY KEY,
    role_name VARCHAR(255) NOT NULL,
    org_id INT NOT NULL DEFAULT 1,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_roles_v2_org FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE CASCADE,
    UNIQUE KEY unique_role_name_org (role_name, org_id),
    INDEX idx_role_name (role_name),
    INDEX idx_org_id (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permissions table with domain grouping
CREATE TABLE permissions (
    permission_id VARCHAR(36) PRIMARY KEY,
    permission_name VARCHAR(255) NOT NULL UNIQUE,
    permission_domain ENUM(
        'Integration-Management',
        'Environment-Management', 
        'Observability-Management',
        'Project-Management',
        'User-Management',
        'Workflow-Management'
    ) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_permission_domain (permission_domain),
    INDEX idx_resource_type (resource_type),
    INDEX idx_permission_name (permission_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Group-User mapping (Many-to-Many)
CREATE TABLE group_user_mapping (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    user_uuid VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group_user_group FOREIGN KEY (group_id) REFERENCES user_groups(group_id) ON DELETE CASCADE,
    CONSTRAINT fk_group_user_user FOREIGN KEY (user_uuid) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY unique_group_user (group_id, user_uuid),
    INDEX idx_user_uuid (user_uuid),
    INDEX idx_group_id (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SSO group mappings (IdP claim value -> ICP group)
CREATE TABLE sso_group_mappings (
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

-- Federated group-user mappings (SSO-owned memberships)
CREATE TABLE federated_group_user_mapping (
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

-- Group-Role mapping with context (Many-to-Many with hierarchical scoping)
CREATE TABLE group_role_mapping (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    role_id VARCHAR(36) NOT NULL,
    org_uuid INT NULL,
    project_uuid CHAR(36) NULL,
    env_uuid CHAR(36) NULL,
    integration_uuid CHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_grp_role_group FOREIGN KEY (group_id) REFERENCES user_groups(group_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_role FOREIGN KEY (role_id) REFERENCES roles_v2(role_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_org FOREIGN KEY (org_uuid) REFERENCES organizations(org_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_project FOREIGN KEY (project_uuid) REFERENCES projects(project_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_env FOREIGN KEY (env_uuid) REFERENCES environments(environment_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_integration FOREIGN KEY (integration_uuid) REFERENCES components(component_id) ON DELETE CASCADE,
    -- Integration access requires project for navigation
    CONSTRAINT chk_integration_requires_project
        CHECK (integration_uuid IS NULL OR project_uuid IS NOT NULL),
    UNIQUE KEY unique_group_role_context (group_id, role_id, org_uuid, project_uuid, env_uuid, integration_uuid),
    INDEX idx_group_id (group_id),
    INDEX idx_role_id (role_id),
    INDEX idx_org_uuid (org_uuid),
    INDEX idx_project_uuid (project_uuid),
    INDEX idx_env_uuid (env_uuid),
    INDEX idx_integration_uuid (integration_uuid),
    INDEX idx_group_project (group_id, project_uuid),
    INDEX idx_group_env (group_id, env_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Role-Permission mapping (Many-to-Many)
CREATE TABLE role_permission_mapping (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_id VARCHAR(36) NOT NULL,
    permission_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_role_perm_role FOREIGN KEY (role_id) REFERENCES roles_v2(role_id) ON DELETE CASCADE,
    CONSTRAINT fk_role_perm_permission FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE,
    UNIQUE KEY unique_role_permission (role_id, permission_id),
    INDEX idx_role_id (role_id),
    INDEX idx_permission_id (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- RBAC V2 VIEWS
-- ============================================================================

-- View: Effective user group memberships from manual and SSO-owned sources
CREATE OR REPLACE VIEW v_effective_group_user_mapping AS
SELECT user_uuid, group_id
FROM group_user_mapping
UNION
SELECT user_uuid, group_id
FROM federated_group_user_mapping;

-- View: User's accessible projects
CREATE OR REPLACE VIEW v_user_project_access AS
-- Direct project-level access
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

-- Org-level access (inherits all projects)
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

-- Integration-level access (project must be visible for navigation)
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

-- View: User's accessible integrations
CREATE OR REPLACE VIEW v_user_integration_access AS
-- Direct integration-level access
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

-- Project-level access (inherits all integrations in project)
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

-- Org-level access (inherits all integrations in all projects)
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

-- View: User's environment access/restrictions
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

-- ============================================================================
-- RBAC V2 SEED DATA
-- ============================================================================

-- Insert default organization (required for foreign key constraints)
INSERT INTO
    organizations (org_id, org_name, org_handle)
VALUES (
        1,
        'Default Organization',
        'default'
    );

-- Insert pre-defined roles
INSERT INTO roles_v2 (role_id, role_name, org_id, description) VALUES
(UUID(), 'Super Admin', 1, 'Full access to all resources and permissions'),
(UUID(), 'Admin', 1, 'Administrative access to projects and integrations'),
(UUID(), 'Developer', 1, 'Development access with limited permissions'),
(UUID(), 'Project Admin', 1, 'Administrative access to a specific project'),
(UUID(), 'Viewer', 1, 'Read-only access with view permissions only');

-- Insert permissions for all domains
INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description) VALUES
-- Integration Management
(UUID(), 'integration_mgt:view', 'Integration-Management', 'integration', 'view', 'View integrations'),
(UUID(), 'integration_mgt:edit', 'Integration-Management', 'integration', 'edit', 'Edit integrations'),
(UUID(), 'integration_mgt:manage', 'Integration-Management', 'integration', 'manage', 'Create, edit, and delete integrations'),

-- Environment Management
(UUID(), 'environment_mgt:manage', 'Environment-Management', 'environment', 'manage', 'Create and delete environments'),
(UUID(), 'environment_mgt:manage_nonprod', 'Environment-Management', 'environment', 'manage', 'Create and delete non-production environments'),

-- Project Management
(UUID(), 'project_mgt:view', 'Project-Management', 'project', 'view', 'View projects'),
(UUID(), 'project_mgt:edit', 'Project-Management', 'project', 'edit', 'Edit projects'),
(UUID(), 'project_mgt:manage', 'Project-Management', 'project', 'manage', 'Create, edit, and delete projects'),

-- Observability Management
(UUID(), 'observability_mgt:view_logs', 'Observability-Management', 'logs', 'view', 'View logs'),
(UUID(), 'observability_mgt:view_insights', 'Observability-Management', 'insights', 'view', 'View insights'),

-- User Management
(UUID(), 'user_mgt:manage_users', 'User-Management', 'user', 'manage', 'Create, update, and delete users'),
(UUID(), 'user_mgt:update_users', 'User-Management', 'user', 'update', 'Assign user groups'),
(UUID(), 'user_mgt:manage_groups', 'User-Management', 'group', 'manage', 'Create, update, and delete groups'),
(UUID(), 'user_mgt:manage_roles', 'User-Management', 'role', 'manage', 'Create, update, and delete roles'),
(UUID(), 'user_mgt:update_group_roles', 'User-Management', 'group-role', 'update', 'Map roles to groups');

-- Workflow Management permissions
INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description) VALUES
    ('a1f4c2e0-0000-4000-8000-000000000001', 'workflow_mgt:view_human_tasks', 'Workflow-Management', 'human_task', 'view', 'View human tasks'),
    ('a1f4c2e0-0000-4000-8000-000000000002', 'workflow_mgt:manage_human_tasks', 'Workflow-Management', 'human_task', 'manage', 'Complete, fail and cancel human tasks'),
    ('a1f4c2e0-0000-4000-8000-000000000003', 'workflow_mgt:view_workflows', 'Workflow-Management', 'workflow', 'view', 'View workflow executions'),
    ('a1f4c2e0-0000-4000-8000-000000000004', 'workflow_mgt:manage_workflows', 'Workflow-Management', 'workflow', 'manage', 'Start, suspend, resume, cancel and terminate workflow executions');

-- Map Super Admin to ALL permissions
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT 
    (SELECT role_id FROM roles_v2 WHERE role_name = 'Super Admin'),
    permission_id
FROM permissions;

-- Map Admin to all permissions except User Management
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT 
    (SELECT role_id FROM roles_v2 WHERE role_name = 'Admin'),
    permission_id
FROM permissions
WHERE permission_domain != 'User-Management';

-- Map Developer to specific permissions
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT 
    (SELECT role_id FROM roles_v2 WHERE role_name = 'Developer'),
    permission_id
FROM permissions
WHERE permission_name IN (
    'integration_mgt:view',
    'integration_mgt:edit',
    'environment_mgt:manage_nonprod',
    'project_mgt:view',
    'project_mgt:edit',
    'observability_mgt:view_logs',
    'observability_mgt:view_insights'
);

-- Map Project Admin to project-specific admin permissions
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT 
    (SELECT role_id FROM roles_v2 WHERE role_name = 'Project Admin'),
    permission_id
FROM permissions
WHERE permission_name IN (
    'project_mgt:manage',
    'integration_mgt:manage',
    'user_mgt:update_group_roles'
);

-- Map Viewer to view-only permissions
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT 
    (SELECT role_id FROM roles_v2 WHERE role_name = 'Viewer'),
    permission_id
FROM permissions
WHERE permission_name IN (
    'integration_mgt:view',
    'project_mgt:view',
    'observability_mgt:view_logs',
    'observability_mgt:view_insights'
);

-- Map Workflow human-task permissions to operational roles (Super Admin/Admin covered above)
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles_v2 r, permissions p
WHERE p.permission_name IN ('workflow_mgt:view_human_tasks', 'workflow_mgt:manage_human_tasks')
    AND (r.role_name IN ('Developer', 'Project Admin') OR (r.role_name = 'Viewer' AND p.permission_name = 'workflow_mgt:view_human_tasks'));

-- Map Workflow execution permissions to admin roles (Super Admin/Admin covered above)
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles_v2 r, permissions p
WHERE (p.permission_name = 'workflow_mgt:view_workflows' AND r.role_name IN ('Developer', 'Project Admin'))
    OR (p.permission_name = 'workflow_mgt:manage_workflows' AND r.role_name = 'Project Admin');

-- Create default groups
INSERT INTO user_groups (group_id, group_name, org_uuid, description) VALUES
(UUID(), 'Super Admins', 1, 'Group for super administrators with full access'),
(UUID(), 'Administrators', 1, 'Group for administrators'),
(UUID(), 'Developers', 1, 'Group for developers');

-- Map Super Admins group to Super Admin role at org level
INSERT INTO group_role_mapping (group_id, role_id, org_uuid)
VALUES (
    (SELECT group_id FROM user_groups WHERE group_name = 'Super Admins'),
    (SELECT role_id FROM roles_v2 WHERE role_name = 'Super Admin'),
    1
);

-- ============================================================================
-- RUNTIMES & ARTIFACTS
-- ============================================================================

CREATE TABLE runtimes (
    runtime_id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NULL,
    project_id CHAR(36) NOT NULL,
    component_id CHAR(36) NOT NULL,
    environment_id CHAR(36) NOT NULL,
    runtime_type ENUM('MI', 'BI') NOT NULL,
    status ENUM(
        'RUNNING',
        'FAILED',
        'DISABLED',
        'OFFLINE'
    ) NOT NULL DEFAULT 'OFFLINE',
    version VARCHAR(50) NULL,
    runtime_hostname VARCHAR(255) NULL,
    runtime_port VARCHAR(10) NULL,
    callback_url VARCHAR(500) NULL,
    wf_boosted_until BIGINT,
    try_it_host VARCHAR(255) NULL,
    platform_name VARCHAR(50) NOT NULL DEFAULT 'ballerina',
    platform_version VARCHAR(50) NULL,
    platform_home VARCHAR(255) NULL,
    os_name VARCHAR(50) NULL,
    os_version VARCHAR(50) NULL,
    carbon_home VARCHAR(500) NULL,
    java_vendor VARCHAR(100) NULL,
    java_version VARCHAR(50) NULL,
    total_memory BIGINT NULL,
    free_memory BIGINT NULL,
    max_memory BIGINT NULL,
    used_memory BIGINT NULL,
    os_arch VARCHAR(50) NULL,
    server_name VARCHAR(200) NULL,
    registration_time TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_heartbeat TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_runtime_project FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_runtime_component FOREIGN KEY (component_id) REFERENCES components (component_id) ON DELETE CASCADE,
    CONSTRAINT fk_runtime_env FOREIGN KEY (environment_id) REFERENCES environments (environment_id) ON DELETE CASCADE,
    CONSTRAINT uq_runtime_identity UNIQUE (component_id, environment_id, name),
    INDEX idx_runtime_type (runtime_type),
    INDEX idx_status (status),
    INDEX idx_env (environment_id),
    INDEX idx_component (component_id),
    INDEX idx_project (project_id),
    INDEX idx_last_heartbeat (last_heartbeat)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Org-level secrets with key_id for JWT HMAC authentication.
-- Lazily bound to a project+component on first heartbeat (M2).
CREATE TABLE org_secrets (
    key_id         VARCHAR(16)  NOT NULL,
    environment_id CHAR(36)     NOT NULL,
    key_material   VARCHAR(256) NOT NULL,
    project_id     CHAR(36)     NULL,
    component_id   CHAR(36)     NULL,
    project_handler VARCHAR(255) NULL,
    component_name  VARCHAR(255) NULL,
    runtime_type    VARCHAR(8)   NULL,
    bound_at       TIMESTAMP    NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by     CHAR(36)     NULL,
    PRIMARY KEY (key_id),
    CONSTRAINT fk_org_secrets_project     FOREIGN KEY (project_id)     REFERENCES projects (project_id)          ON DELETE CASCADE,
    CONSTRAINT fk_org_secrets_component   FOREIGN KEY (component_id)   REFERENCES components (component_id)      ON DELETE CASCADE,
    CONSTRAINT fk_org_secrets_environment FOREIGN KEY (environment_id) REFERENCES environments (environment_id)   ON DELETE CASCADE,
    CONSTRAINT fk_org_secrets_created_by  FOREIGN KEY (created_by)     REFERENCES users (user_id)                ON DELETE SET NULL,
    INDEX idx_org_secrets_environment (environment_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE runtimes ADD COLUMN key_id VARCHAR(16) NULL;
ALTER TABLE runtimes ADD CONSTRAINT fk_runtime_key_id FOREIGN KEY (key_id) REFERENCES org_secrets (key_id) ON DELETE SET NULL;

-- Services deployed on a runtime
CREATE TABLE bi_service_artifacts (
    runtime_id CHAR(36) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    service_package VARCHAR(200) NOT NULL,
    base_path VARCHAR(500) NULL,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, service_name, service_package),
    CONSTRAINT fk_bi_service_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_service_name (service_name),
    INDEX idx_service_package (service_package),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Resources inside a service (HTTP resources etc.)
CREATE TABLE bi_service_resource_artifacts (
  runtime_id    VARCHAR(100) NOT NULL,
  service_name  VARCHAR(100) NOT NULL,
  resource_url  VARCHAR(1000) NOT NULL,
  methods       JSON NOT NULL,  -- Array of HTTP methods

-- Generated column for indexing first method (example pattern)


method_first  VARCHAR(20)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(methods, '$[0]'))) STORED,

  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (runtime_id, service_name, resource_url(255)),
  CONSTRAINT fk_bi_service_resource_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes(runtime_id) ON DELETE CASCADE,

  INDEX idx_runtime_service (runtime_id, service_name),
  INDEX idx_resource_url (resource_url(255)),
  INDEX idx_method_first (method_first)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OpenAPI (Swagger) definitions packed into a BI runtime's JAR by the swagger-pack compiler
-- plugin, reported via the full heartbeat's optional openApiDefinitions field.
CREATE TABLE bi_service_openapi_definitions (
  runtime_id  CHAR(36) NOT NULL,
  file_name   VARCHAR(300) NOT NULL,
  definition  JSON NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (runtime_id, file_name),
  CONSTRAINT fk_bi_service_openapi_definitions_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes(runtime_id) ON DELETE CASCADE,
  INDEX idx_runtime_id (runtime_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Workflow metadata document published by a runtime's ICP bridge (one row per runtime)
CREATE TABLE bi_workflow_metadata (
  runtime_id   CHAR(36) NOT NULL,
  metadata     JSON NOT NULL,
  capabilities VARCHAR(512),
  task_queue VARCHAR(255),
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (runtime_id),
  CONSTRAINT fk_bi_workflow_metadata_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes(runtime_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- TUNNELED OPERATIONS (derived state, shared across ICP nodes)
-- ============================================================================
-- One generic table for the work the control plane tunnels to a runtime over its heartbeat:
-- a read whose answer is cached and re-served while it refreshes, or a mutation whose outcome
-- is queued and polled for. It knows nothing of workflows — `kind` says what a row is about,
-- `cacheable` which of the two it is, and `data` carries the rest, so a second feature
-- needing the same shape adds a kind rather than a table.
--
-- This is DERIVED state. An upgrade may drop and recreate the table, and nothing in it needs
-- migrating — losing a row costs one refetch, or one caller being told their operation was
-- never confirmed.
--
-- What earns a column is what a WHERE clause needs; everything else lives in `data`. The ICP
-- supports five database engines, and portable JSON predicates across them do not exist:
--   op_id       the row's identity: a read's COMPUTED key sha256(kind|owner|request|identity),
--               or a mutation's caller/decision-derived id, so a resubmission collides
--   cacheable   read (re-served while stale) vs mutation (one row, one outcome)
--   owner       the scope a row belongs to; what a read claim filters on
--   target      the runtime a mutation is addressed to (null for a read — any runtime answers)
--   token       a read's in-flight attempt, which fences a late answer from a superseded one
--   expires_at  epoch SECONDS, not a timestamp: every read, claim and sweep compares it, and
--               integers compare identically on all five engines while timestamp arithmetic
--               needs four different implementations (see storage/database_dialect.bal). It is
--               the current phase's deadline — a read's staleness horizon, a mutation's
--               delivery deadline
--
-- No foreign key, deliberately: a K8S deployment DELETEs runtime rows when they go offline,
-- and ON DELETE CASCADE would discard the record of an operation whose outcome nobody has
-- established - the one thing here worth keeping.

CREATE TABLE tunneled_operation (
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


-- Listeners bound to a runtime (e.g., HTTP/HTTPS)
CREATE TABLE bi_runtime_listener_artifacts (
    runtime_id CHAR(36) NOT NULL,
    listener_name VARCHAR(100) NOT NULL,
    listener_package VARCHAR(200) NOT NULL,
    protocol VARCHAR(20) NULL DEFAULT 'HTTP',
    listener_host VARCHAR(100),
    listener_port INT,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, listener_name),
    CONSTRAINT fk_bi_runtime_listener_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_listener_name (listener_name),
    INDEX idx_protocol (protocol),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Service-to-listener bindings: which listener(s) each service is attached to.
-- Populated from heartbeat.artifacts.services[].listeners (name-only) and keyed to
-- bi_runtime_listener_artifacts by (runtime_id, listener_name). Many-to-many:
-- a service may bind multiple listeners; a listener may serve multiple services.
CREATE TABLE bi_service_listener_bindings (
    runtime_id CHAR(36) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    service_package VARCHAR(200) NOT NULL,
    listener_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, service_name, service_package, listener_name),
    CONSTRAINT fk_bi_slb_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_slb_service (runtime_id, service_name, service_package),
    INDEX idx_slb_listener (runtime_id, listener_name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Automation artifacts (main function) for BI integrations
CREATE TABLE bi_automation_artifacts (
    runtime_id CHAR(36) NOT NULL,
    package_org VARCHAR(200) NOT NULL,
    package_name VARCHAR(200) NOT NULL,
    package_version VARCHAR(50) NOT NULL,
    execution_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, execution_timestamp),
    CONSTRAINT fk_bi_automation_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_package_name (package_name),
    INDEX idx_execution_timestamp (execution_timestamp)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE bi_automation_execution_history (
    execution_id CHAR(36) NOT NULL,
    runtime_id CHAR(36) NOT NULL,
    package_org VARCHAR(200) NOT NULL,
    package_name VARCHAR(200) NOT NULL,
    package_version VARCHAR(50) NOT NULL,
    execution_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (execution_id),
    CONSTRAINT fk_bi_automation_execution_history_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_package_name (package_name),
    INDEX idx_execution_timestamp (execution_timestamp)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Runtime log levels for BI components
CREATE TABLE bi_runtime_log_levels (
    runtime_id CHAR(36) NOT NULL,
    component_name VARCHAR(200) NOT NULL,
    log_level ENUM('DEBUG', 'ERROR', 'INFO', 'WARN') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, component_name),
    CONSTRAINT fk_bi_runtime_log_levels_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_component_name (component_name),
    INDEX idx_log_level (log_level)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ============================================================================
-- MI-SPECIFIC ARTIFACT TABLES
-- ============================================================================

-- REST APIs (MI)
CREATE TABLE mi_api_artifacts (
    runtime_id CHAR(36) NOT NULL,
    api_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    url VARCHAR(500) NOT NULL,
    urls TEXT NULL, -- JSON array of URLs
    context VARCHAR(500) NOT NULL,
    version VARCHAR(50) NULL,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    statistics VARCHAR(20) NOT NULL DEFAULT 'disabled',
    composite_app VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, api_name),
    CONSTRAINT fk_mi_api_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_api_name (api_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- API Resources (MI) - Resources inside an API
CREATE TABLE mi_api_resource_artifacts (
    runtime_id CHAR(36) NOT NULL,
    api_name VARCHAR(200) NOT NULL,
    resource_path VARCHAR(1000) NOT NULL,
    methods VARCHAR(20) NOT NULL, -- Single HTTP method as string (e.g., "POST", "GET")
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, api_name, resource_path(255)),
    CONSTRAINT fk_mi_api_resource_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_api (runtime_id, api_name),
    INDEX idx_resource_path (resource_path (255)),
    INDEX idx_methods (methods)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Proxy Services (MI)
CREATE TABLE mi_proxy_service_artifacts (
    runtime_id CHAR(36) NOT NULL,
    proxy_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    statistics VARCHAR(20) NOT NULL DEFAULT 'disabled',
    composite_app VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, proxy_name),
    CONSTRAINT fk_mi_proxy_service_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_proxy_name (proxy_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Proxy Service Endpoints (MI)
CREATE TABLE mi_proxy_service_endpoint_artifacts (
    runtime_id CHAR(36) NOT NULL,
    proxy_name VARCHAR(200) NOT NULL,
    endpoint_url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, proxy_name, endpoint_url(255)),
    CONSTRAINT fk_mi_proxy_service_endpoint_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_mi_proxy_service_endpoint_artifacts_runtime_id (runtime_id),
    INDEX idx_mi_proxy_service_endpoint_artifacts_proxy_name (proxy_name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Endpoints (MI)
CREATE TABLE mi_endpoint_artifacts (
    runtime_id CHAR(36) NOT NULL,
    endpoint_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    endpoint_type VARCHAR(100) NOT NULL,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    statistics VARCHAR(20) NOT NULL DEFAULT 'disabled',
    composite_app VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, endpoint_name),
    CONSTRAINT fk_mi_endpoint_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_endpoint_name (endpoint_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_endpoint_type (endpoint_type),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Endpoint Attributes (MI)
CREATE TABLE mi_endpoint_attribute_artifacts (
    runtime_id CHAR(36) NOT NULL,
    endpoint_name VARCHAR(200) NOT NULL,
    attribute_name VARCHAR(200) NOT NULL,
    attribute_value TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, endpoint_name, attribute_name),
    CONSTRAINT fk_mi_endpoint_attribute_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_mi_endpoint_attribute_artifacts_runtime_id (runtime_id),
    INDEX idx_mi_endpoint_attribute_artifacts_endpoint_name (endpoint_name),
    INDEX idx_mi_endpoint_attribute_artifacts_attribute_name (attribute_name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Inbound Endpoints (MI)
CREATE TABLE mi_inbound_endpoint_artifacts (
    runtime_id CHAR(36) NOT NULL,
    inbound_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    protocol VARCHAR(50) NULL,
    sequence VARCHAR(200) NULL,
    statistics VARCHAR(20) NULL,
    on_error VARCHAR(200) NULL,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    composite_app VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, inbound_name),
    CONSTRAINT fk_mi_inbound_endpoint_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_inbound_name (inbound_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_protocol (protocol),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Sequences (MI)
CREATE TABLE mi_sequence_artifacts (
    runtime_id CHAR(36) NOT NULL,
    sequence_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    sequence_type VARCHAR(100) NULL,
    container VARCHAR(200) NULL,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    statistics VARCHAR(20) NOT NULL DEFAULT 'disabled',
    composite_app VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, sequence_name),
    CONSTRAINT fk_mi_sequence_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_sequence_name (sequence_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_sequence_type (sequence_type),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Tasks (MI)
CREATE TABLE mi_task_artifacts (
    runtime_id CHAR(36) NOT NULL,
    task_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    task_class VARCHAR(500) NULL,
    task_group VARCHAR(200) NULL,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    composite_app VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, task_name),
    CONSTRAINT fk_mi_task_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_task_name (task_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Templates (MI)
CREATE TABLE mi_template_artifacts (
    runtime_id CHAR(36) NOT NULL,
    template_name VARCHAR(200) NOT NULL,
    template_type VARCHAR(100) NOT NULL,
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    statistics VARCHAR(20) NOT NULL DEFAULT 'disabled',
    composite_app VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, template_name),
    CONSTRAINT fk_mi_template_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_template_name (template_name),
    INDEX idx_template_type (template_type)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Message Stores (MI)
CREATE TABLE mi_message_store_artifacts (
    runtime_id CHAR(36) NOT NULL,
    store_name VARCHAR(200) NOT NULL,
    store_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    composite_app VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, store_name),
    CONSTRAINT fk_mi_message_store_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_store_name (store_name),
    INDEX idx_store_type (store_type)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Message Processors (MI)
CREATE TABLE mi_message_processor_artifacts (
    runtime_id CHAR(36) NOT NULL,
    processor_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    processor_type VARCHAR(100) NOT NULL,
    processor_class VARCHAR(500) NULL,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    composite_app VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, processor_name),
    CONSTRAINT fk_mi_message_processor_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_processor_name (processor_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_processor_type (processor_type),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Local Entries (MI)
CREATE TABLE mi_local_entry_artifacts (
    runtime_id CHAR(36) NOT NULL,
    entry_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    entry_type VARCHAR(100) NOT NULL,
    entry_value TEXT NULL,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    composite_app VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, entry_name),
    CONSTRAINT fk_mi_local_entry_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_entry_name (entry_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_entry_type (entry_type),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Data Services (MI)
CREATE TABLE mi_data_service_artifacts (
    runtime_id CHAR(36) NOT NULL,
    service_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    description TEXT NULL,
    wsdl TEXT NULL,
    state ENUM('Active', 'Faulty') NOT NULL DEFAULT 'Active',
    composite_app VARCHAR(200) NULL,
    error_message TEXT NULL, -- Error message when state is Faulty (data service failed to deploy)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, service_name),
    CONSTRAINT fk_mi_data_service_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_service_name (service_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Composite Apps (MI)
CREATE TABLE mi_composite_app_artifacts (
    runtime_id CHAR(36) NOT NULL,
    app_name VARCHAR(200) NOT NULL,
    version VARCHAR(50) NULL,
    state ENUM('Active', 'Faulty') NOT NULL DEFAULT 'Active',
    error_message TEXT NULL, -- Error message when state is Faulty
    artifacts VARCHAR(4000) NULL, -- JSON array serialized as string (convert to JSON in app code when needed)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, app_name),
    CONSTRAINT fk_mi_composite_app_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_app_name (app_name),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Data Sources (MI)
CREATE TABLE mi_data_source_artifacts (
    runtime_id CHAR(36) NOT NULL,
    datasource_name VARCHAR(200) NOT NULL,
    datasource_type VARCHAR(100) NULL,
    driver VARCHAR(500) NULL,
    url VARCHAR(1000) NULL,
    username VARCHAR(255) NULL,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, datasource_name),
    CONSTRAINT fk_mi_data_source_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_datasource_name (datasource_name),
    INDEX idx_datasource_type (datasource_type),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Connectors (MI)
CREATE TABLE mi_connector_artifacts (
    runtime_id CHAR(36) NOT NULL,
    connector_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    package VARCHAR(200) NOT NULL,
    version VARCHAR(50) NULL,
    description VARCHAR(500) NULL,
    state ENUM(
        'enabled',
        'disabled'
    ) NOT NULL DEFAULT 'enabled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, connector_name, package),
    CONSTRAINT fk_mi_connector_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_connector_name (connector_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_state (state)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Registry Resources (MI)
CREATE TABLE mi_registry_resource_artifacts (
    runtime_id CHAR(36) NOT NULL,
    resource_name VARCHAR(200) NOT NULL,
    resource_type VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, resource_name),
    CONSTRAINT fk_mi_registry_resource_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_resource_name (resource_name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ============================================================================
-- CONTROL COMMANDS
-- ============================================================================

CREATE TABLE mi_runtime_control_commands (
    runtime_id CHAR(36) NOT NULL,
    component_id CHAR(36) NOT NULL,
    artifact_name VARCHAR(200) NOT NULL,
    artifact_type VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL, -- enable_artifact, disable_artifact, enable_tracing, disable_tracing
    status ENUM(
        'pending',
        'sent',
        'acknowledged',
        'completed',
        'failed',
        'timeout'
    ) NOT NULL DEFAULT 'pending',
    issued_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    sent_at TIMESTAMP(6) NULL,
    acknowledged_at TIMESTAMP(6) NULL,
    completed_at TIMESTAMP(6) NULL,
    error_message TEXT NULL,
    issued_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, component_id, artifact_name, artifact_type),
    CONSTRAINT fk_mi_runtime_control_cmd_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    CONSTRAINT fk_mi_runtime_control_cmd_component FOREIGN KEY (component_id) REFERENCES components (component_id) ON DELETE CASCADE,
    CONSTRAINT fk_mi_runtime_control_cmd_issued_by FOREIGN KEY (issued_by) REFERENCES users (user_id) ON DELETE SET NULL,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_component_id (component_id),
    INDEX idx_artifact_name (artifact_name),
    INDEX idx_artifact_type (artifact_type),
    INDEX idx_status (status),
    INDEX idx_issued_at (issued_at),
    INDEX idx_action (action),
    INDEX idx_issued_by (issued_by)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- ============================================================================
-- Reconciliation Engine Tables
-- ============================================================================

CREATE TABLE reconcile_desired_state (
    component_id CHAR(36) NOT NULL,
    env_id CHAR(36) NOT NULL,
    artifact_name VARCHAR(200) NOT NULL,
    artifact_type VARCHAR(100) NOT NULL,
    state_key VARCHAR(255) NOT NULL,
    state_value VARCHAR(1024),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (component_id, env_id, artifact_name, artifact_type, state_key),
    INDEX idx_reconcile_desired_comp_env (component_id, env_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE reconcile_observed_state (
    runtime_id CHAR(36) NOT NULL,
    component_id CHAR(36) NOT NULL,
    env_id CHAR(36) NOT NULL,
    artifact_name VARCHAR(200) NOT NULL,
    artifact_type VARCHAR(100) NOT NULL,
    state_key VARCHAR(255) NOT NULL,
    state_value VARCHAR(1024),
    optimistic TINYINT(1) NOT NULL DEFAULT 0,
    heartbeat_gen BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, artifact_name, artifact_type, state_key),
    INDEX idx_reconcile_observed_comp_env (component_id, env_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE reconcile_backoff (
    runtime_id CHAR(36) NOT NULL,
    artifact_name VARCHAR(200) NOT NULL,
    artifact_type VARCHAR(100) NOT NULL,
    state_key VARCHAR(255) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    has_error INT NOT NULL DEFAULT 0,
    next_attempt BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (runtime_id, artifact_name, artifact_type, state_key)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE mi_logger_intended_state (
    component_id CHAR(36) NOT NULL,
    logger_name VARCHAR(500) NOT NULL,
    log_level ENUM('OFF', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL') NOT NULL,
    issued_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    issued_by CHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (component_id, logger_name),
    CONSTRAINT fk_mi_logger_state_component FOREIGN KEY (component_id) REFERENCES components (component_id) ON DELETE CASCADE,
    CONSTRAINT fk_mi_logger_state_issued_by FOREIGN KEY (issued_by) REFERENCES users (user_id) ON DELETE SET NULL,
    INDEX idx_mi_logger_intended_state_component_id (component_id),
    INDEX idx_mi_logger_intended_state_logger_name (logger_name),
    INDEX idx_mi_logger_intended_state_log_level (log_level)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ============================================================================
-- AUDIT & EVENTS
-- ============================================================================

CREATE TABLE audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    runtime_id CHAR(36) NULL,
    user_id CHAR(36) NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NULL, -- runtime, service, listener, command
    resource_id VARCHAR(200) NULL,
    details TEXT NULL,
    client_ip VARCHAR(45) NULL, -- IPv6 compatible
    user_agent VARCHAR(500) NULL,
    timestamp TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_resource_type (resource_type),
    INDEX idx_timestamp (timestamp),
    INDEX idx_client_ip (client_ip)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE system_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- heartbeat_timeout, runtime_offline, system_error
    severity ENUM(
        'INFO',
        'WARN',
        'ERROR',
        'CRITICAL'
    ) NOT NULL DEFAULT 'INFO',
    source VARCHAR(100) NULL, -- runtime_id or system component
    message TEXT NOT NULL,
    metadata JSON NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMP NULL,
    resolved_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sys_events_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (user_id) ON DELETE SET NULL,
    INDEX idx_event_type (event_type),
    INDEX idx_severity (severity),
    INDEX idx_source (source),
    INDEX idx_resolved (resolved),
    INDEX idx_created_at (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ============================================================================
-- MONITORING & HEALTH
-- ============================================================================

CREATE TABLE runtime_metrics (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    runtime_id CHAR(36) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15, 4) NOT NULL,
    metric_unit VARCHAR(20) NULL,
    tags JSON NULL,
    timestamp TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_metrics_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_metric (runtime_id, metric_name),
    INDEX idx_timestamp (timestamp),
    INDEX idx_metric_name (metric_name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE health_checks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    runtime_id CHAR(36) NOT NULL,
    check_type VARCHAR(50) NOT NULL, -- heartbeat, connectivity, resource
    status ENUM(
        'HEALTHY',
        'DEGRADED',
        'UNHEALTHY'
    ) NOT NULL,
    response_time_ms INT NULL,
    error_message TEXT NULL,
    details JSON NULL,
    timestamp TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_health_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_check (runtime_id, check_type),
    INDEX idx_status (status),
    INDEX idx_timestamp (timestamp)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ============================================================================
-- SYSTEM CONFIG
-- ============================================================================

CREATE TABLE system_config (
    config_key VARCHAR(100) NOT NULL PRIMARY KEY,
    config_value TEXT NOT NULL,
    config_type ENUM(
        'STRING',
        'INTEGER',
        'BOOLEAN',
        'JSON'
    ) NOT NULL DEFAULT 'STRING',
    description TEXT NULL,
    is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_syscfg_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE SET NULL,
    INDEX idx_config_type (config_type),
    INDEX idx_updated_at (updated_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ============================================================================
-- SAMPLE DATA FOR TESTING
-- ============================================================================

-- Note: Default organization and super admin user are created in RBAC V2 SEED DATA section above

-- Note: User credentials are stored in a separate H2 database (credentialsdb)
-- accessed only by the default auth backend. See resources/db/init-scripts/credentials_h2_init.sql

-- Insert sample environments
INSERT INTO
    environments (
        environment_id,
        name,
        handler,
        description,
        region,
        cluster_id,
        choreo_env,
        external_apim_env_name,
        internal_apim_env_name,
        sandbox_apim_env_name,
        critical,
        dns_prefix,
        created_by
    )
VALUES (
        '750e8400-e29b-41d4-a716-446655440001',
        'dev',
        'dev',
        'Development environment',
        'us-east-1',
        'cluster-abc123',
        'dev',
        'dev-external',
        'dev-internal',
        'dev-sandbox',
        FALSE,
        'dev',
        NULL
    ),
    (
        '750e8400-e29b-41d4-a716-446655440002',
        'prod',
        'prod',
        'Production environment',
        'us-east-1',
        'cluster-abc123',
        'prod',
        'prod-external',
        'prod-internal',
        'prod-sandbox',
        TRUE,
        'prod',
        NULL
    );
