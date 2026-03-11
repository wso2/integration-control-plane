--
-- Drop all database objects (tables, views, sequences, etc.)
DROP ALL OBJECTS;
--
-- ============================================================================

CREATE TABLE organizations (
    org_id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    org_name VARCHAR(255) NOT NULL UNIQUE,
    org_handle VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_org_handle ON organizations (org_handle);

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
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_username ON users (username);

CREATE INDEX idx_super_admin ON users (is_super_admin);

CREATE INDEX idx_project_author ON users (is_project_author);

-- ============================================================================
-- REFRESH TOKENS (for authentication session management)
-- ============================================================================

CREATE TABLE refresh_tokens (
    token_id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMP,
    user_agent VARCHAR(500),
    ip_address VARCHAR(50),
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);

CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);

CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens (revoked);

-- ============================================================================
-- PROJECTS / COMPONENTS / ENVIRONMENTS
-- ============================================================================

CREATE TABLE projects (
    project_id CHAR(36) PRIMARY KEY,
    org_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    version VARCHAR(50) DEFAULT '1.0.0',
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    handler VARCHAR(200) NOT NULL,
    region VARCHAR(100),
    description TEXT,
    default_deployment_pipeline_id CHAR(36),
    deployment_pipeline_ids CLOB,
    type VARCHAR(50),
    git_provider VARCHAR(50),
    git_organization VARCHAR(200),
    repository VARCHAR(200),
    branch VARCHAR(100),
    secret_ref VARCHAR(200),
    owner_id CHAR(36),
    created_by VARCHAR(200),
    updated_by VARCHAR(200),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_projects_org FOREIGN KEY (org_id) REFERENCES organizations (org_id) ON DELETE RESTRICT,
    CONSTRAINT uk_project_name_org UNIQUE (org_id, name)
);

CREATE INDEX idx_projects_owner_id ON projects (owner_id);

CREATE INDEX idx_projects_org_id ON projects (org_id);

CREATE INDEX idx_projects_handler ON projects ( handler );

CREATE TABLE components (
    component_id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    name VARCHAR(150) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    component_type VARCHAR(10) NOT NULL DEFAULT 'BI' CHECK (
        component_type IN ('MI', 'BI')
    ),
    created_by CHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by CHAR(36),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_components_project FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_components_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_components_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT uk_component_project_name UNIQUE (project_id, name)
);

CREATE INDEX idx_components_project_id ON components (project_id);

CREATE TABLE environments (
    environment_id CHAR(36) PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    region VARCHAR(100),
    cluster_id VARCHAR(200),
    choreo_env VARCHAR(50),
    external_apim_env_name VARCHAR(200),
    internal_apim_env_name VARCHAR(200),
    sandbox_apim_env_name VARCHAR(200),
    critical BOOLEAN NOT NULL DEFAULT FALSE,
    dns_prefix VARCHAR(100),
    created_by CHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by CHAR(36),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_environments_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_environments_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE SET NULL
);

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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_groups_org FOREIGN KEY (org_uuid) REFERENCES organizations (org_id) ON DELETE CASCADE
);

CREATE INDEX idx_user_groups_org_uuid ON user_groups (org_uuid);

CREATE INDEX idx_user_groups_group_name ON user_groups (group_name);

-- Roles v2 table (new structure for permission-based RBAC)
CREATE TABLE roles_v2 (
    role_id VARCHAR(36) PRIMARY KEY,
    role_name VARCHAR(255) NOT NULL,
    org_id INT NOT NULL DEFAULT 1,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_roles_v2_org FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE CASCADE,
    CONSTRAINT unique_role_name_org UNIQUE (role_name, org_id)
);

CREATE INDEX idx_roles_v2_role_name ON roles_v2 (role_name);
CREATE INDEX idx_roles_v2_org_id ON roles_v2 (org_id);

-- Permissions table with domain grouping
CREATE TABLE permissions (
    permission_id VARCHAR(36) PRIMARY KEY,
    permission_name VARCHAR(255) NOT NULL UNIQUE,
    permission_domain VARCHAR(50) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_permission_domain CHECK (
        permission_domain IN (
            'Integration-Management',
            'Environment-Management',
            'Observability-Management',
            'Project-Management',
            'User-Management'
        )
    )
);

CREATE INDEX idx_permissions_domain ON permissions (permission_domain);

CREATE INDEX idx_permissions_resource_type ON permissions (resource_type);

CREATE INDEX idx_permissions_name ON permissions (permission_name);

-- Group-User mapping (Many-to-Many)
CREATE TABLE group_user_mapping (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    user_uuid VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group_user_group FOREIGN KEY (group_id) REFERENCES user_groups (group_id) ON DELETE CASCADE,
    CONSTRAINT fk_group_user_user FOREIGN KEY (user_uuid) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT unique_group_user UNIQUE (group_id, user_uuid)
);

CREATE INDEX idx_group_user_user_uuid ON group_user_mapping (user_uuid);

CREATE INDEX idx_group_user_group_id ON group_user_mapping (group_id);

-- Group-Role mapping with context (Many-to-Many with hierarchical scoping)
CREATE TABLE group_role_mapping (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    role_id VARCHAR(36) NOT NULL,
    org_uuid INT,
    project_uuid CHAR(36),
    env_uuid CHAR(36),
    integration_uuid CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_grp_role_group FOREIGN KEY (group_id) REFERENCES user_groups (group_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_role FOREIGN KEY (role_id) REFERENCES roles_v2 (role_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_org FOREIGN KEY (org_uuid) REFERENCES organizations (org_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_project FOREIGN KEY (project_uuid) REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_env FOREIGN KEY (env_uuid) REFERENCES environments (environment_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_integration FOREIGN KEY (integration_uuid) REFERENCES components (component_id) ON DELETE CASCADE,
    CONSTRAINT chk_integration_requires_project CHECK (
        integration_uuid IS NULL
        OR project_uuid IS NOT NULL
    ),
    CONSTRAINT unique_group_role_context UNIQUE (
        group_id,
        role_id,
        org_uuid,
        project_uuid,
        env_uuid,
        integration_uuid
    )
);

CREATE INDEX idx_grp_role_group_id ON group_role_mapping (group_id);

CREATE INDEX idx_grp_role_role_id ON group_role_mapping (role_id);

CREATE INDEX idx_grp_role_org_uuid ON group_role_mapping (org_uuid);

CREATE INDEX idx_grp_role_project_uuid ON group_role_mapping (project_uuid);

CREATE INDEX idx_grp_role_env_uuid ON group_role_mapping (env_uuid);

CREATE INDEX idx_grp_role_integration_uuid ON group_role_mapping (integration_uuid);

CREATE INDEX idx_grp_role_group_project ON group_role_mapping (group_id, project_uuid);

CREATE INDEX idx_grp_role_group_env ON group_role_mapping (group_id, env_uuid);

-- Role-Permission mapping (Many-to-Many)
CREATE TABLE role_permission_mapping (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_id VARCHAR(36) NOT NULL,
    permission_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_role_perm_role FOREIGN KEY (role_id) REFERENCES roles_v2 (role_id) ON DELETE CASCADE,
    CONSTRAINT fk_role_perm_permission FOREIGN KEY (permission_id) REFERENCES permissions (permission_id) ON DELETE CASCADE,
    CONSTRAINT unique_role_permission UNIQUE (role_id, permission_id)
);

CREATE INDEX idx_role_perm_role_id ON role_permission_mapping (role_id);

CREATE INDEX idx_role_perm_permission_id ON role_permission_mapping (permission_id);

-- ============================================================================
-- RBAC V2 VIEWS
-- ============================================================================

-- View: User's accessible projects
CREATE VIEW v_user_project_access AS
-- Direct project-level access
SELECT DISTINCT
    gum.user_uuid,
    grm.project_uuid,
    p.name AS project_name,
    p.org_id AS org_uuid,
    grm.role_id,
    'project' AS access_level
FROM
    group_user_mapping gum
    INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
    INNER JOIN projects p ON grm.project_uuid = p.project_id
WHERE
    grm.project_uuid IS NOT NULL
    AND grm.integration_uuid IS NULL
UNION

-- Org-level access (inherits all projects)
SELECT DISTINCT
    gum.user_uuid,
    p.project_id AS project_uuid,
    p.name AS project_name,
    p.org_id AS org_uuid,
    grm.role_id,
    'org' AS access_level
FROM
    group_user_mapping gum
    INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
    INNER JOIN projects p ON grm.org_uuid = p.org_id
WHERE
    grm.org_uuid IS NOT NULL
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
FROM
    group_user_mapping gum
    INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
    INNER JOIN projects p ON grm.project_uuid = p.project_id
WHERE
    grm.integration_uuid IS NOT NULL;

-- View: User's accessible integrations
CREATE VIEW v_user_integration_access AS
-- Direct integration-level access
SELECT DISTINCT
    gum.user_uuid,
    grm.integration_uuid,
    c.name AS integration_name,
    c.project_id AS project_uuid,
    grm.env_uuid,
    grm.role_id,
    'integration' AS access_level
FROM
    group_user_mapping gum
    INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
    INNER JOIN components c ON grm.integration_uuid = c.component_id
WHERE
    grm.integration_uuid IS NOT NULL
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
FROM
    group_user_mapping gum
    INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
    INNER JOIN components c ON grm.project_uuid = c.project_id
WHERE
    grm.project_uuid IS NOT NULL
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
FROM
    group_user_mapping gum
    INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
    INNER JOIN projects p ON grm.org_uuid = p.org_id
    INNER JOIN components c ON p.project_id = c.project_id
WHERE
    grm.org_uuid IS NOT NULL
    AND grm.project_uuid IS NULL
    AND grm.integration_uuid IS NULL;

-- View: User's environment access/restrictions
CREATE VIEW v_user_environment_access AS
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
FROM
    group_user_mapping gum
    INNER JOIN group_role_mapping grm ON gum.group_id = grm.group_id
WHERE
    grm.env_uuid IS NOT NULL
    OR grm.org_uuid IS NOT NULL;

-- ============================================================================
-- RBAC V2 SEED DATA
-- ============================================================================

-- Insert default organization (required for foreign key constraints)
INSERT INTO organizations (org_id, org_name, org_handle)
VALUES (1, 'Default Organization', 'default');

-- Insert pre-defined roles
INSERT INTO roles_v2 (role_id, role_name, org_id, description) VALUES
(RANDOM_UUID(), 'Super Admin', 1, 'Full access to all resources and permissions'),
(RANDOM_UUID(), 'Admin', 1, 'Administrative access to projects and integrations'),
(RANDOM_UUID(), 'Developer', 1, 'Development access with limited permissions'),
(RANDOM_UUID(), 'Project Admin', 1, 'Administrative access to a specific project'),
(RANDOM_UUID(), 'Viewer', 1, 'Read-only access with view permissions only');

-- Insert permissions for all domains
INSERT INTO
    permissions (
        permission_id,
        permission_name,
        permission_domain,
        resource_type,
        action,
        description
    )
VALUES
    -- Integration Management
    (
        RANDOM_UUID (),
        'integration_mgt:view',
        'Integration-Management',
        'integration',
        'view',
        'View integrations'
    ),
    (
        RANDOM_UUID (),
        'integration_mgt:edit',
        'Integration-Management',
        'integration',
        'edit',
        'Edit integrations'
    ),
    (
        RANDOM_UUID (),
        'integration_mgt:manage',
        'Integration-Management',
        'integration',
        'manage',
        'Create, edit, and delete integrations'
    ),

-- Environment Management
(
    RANDOM_UUID (),
    'environment_mgt:manage',
    'Environment-Management',
    'environment',
    'manage',
    'Create and delete environments'
),
(
    RANDOM_UUID (),
    'environment_mgt:manage_nonprod',
    'Environment-Management',
    'environment',
    'manage',
    'Create and delete non-production environments'
),

-- Project Management
(
    RANDOM_UUID (),
    'project_mgt:view',
    'Project-Management',
    'project',
    'view',
    'View projects'
),
(
    RANDOM_UUID (),
    'project_mgt:edit',
    'Project-Management',
    'project',
    'edit',
    'Edit projects'
),
(
    RANDOM_UUID (),
    'project_mgt:manage',
    'Project-Management',
    'project',
    'manage',
    'Create, edit, and delete projects'
),

-- Observability Management
(
    RANDOM_UUID (),
    'observability_mgt:view_logs',
    'Observability-Management',
    'logs',
    'view',
    'View logs'
),
(
    RANDOM_UUID (),
    'observability_mgt:view_insights',
    'Observability-Management',
    'insights',
    'view',
    'View insights'
),

-- User Management
(
    RANDOM_UUID (),
    'user_mgt:manage_users',
    'User-Management',
    'user',
    'manage',
    'Create, update, and delete users'
),
(
    RANDOM_UUID (),
    'user_mgt:update_users',
    'User-Management',
    'user',
    'update',
    'Assign user groups'
),
(
    RANDOM_UUID (),
    'user_mgt:manage_groups',
    'User-Management',
    'group',
    'manage',
    'Create, update, and delete groups'
),
(
    RANDOM_UUID (),
    'user_mgt:manage_roles',
    'User-Management',
    'role',
    'manage',
    'Create, update, and delete roles'
),
(
    RANDOM_UUID (),
    'user_mgt:update_group_roles',
    'User-Management',
    'group-role',
    'update',
    'Map roles to groups'
);

-- Map Super Admin to ALL permissions
INSERT INTO
    role_permission_mapping (role_id, permission_id)
SELECT (
        SELECT role_id
        FROM roles_v2
        WHERE
            role_name = 'Super Admin'
    ), permission_id
FROM permissions;

-- Map Admin to all permissions except User Management
INSERT INTO
    role_permission_mapping (role_id, permission_id)
SELECT (
        SELECT role_id
        FROM roles_v2
        WHERE
            role_name = 'Admin'
    ), permission_id
FROM permissions
WHERE
    permission_domain != 'User-Management';

-- Map Developer to specific permissions
INSERT INTO
    role_permission_mapping (role_id, permission_id)
SELECT (
        SELECT role_id
        FROM roles_v2
        WHERE
            role_name = 'Developer'
    ), permission_id
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

-- Insert default admin user (required for group assignments)
INSERT INTO users (user_id, username, display_name, is_super_admin)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'admin', 'System Administrator', TRUE);

-- Create default groups
INSERT INTO user_groups (group_id, group_name, org_uuid, description) VALUES
(RANDOM_UUID(), 'Super Admins', 1, 'Group for super administrators with full access'),
(RANDOM_UUID(), 'Administrators', 1, 'Group for administrators'),
(RANDOM_UUID(), 'Developers', 1, 'Group for developers');

-- Assign super admin user to Super Admins group
INSERT INTO group_user_mapping (group_id, user_uuid)
VALUES (
    (SELECT group_id FROM user_groups WHERE group_name = 'Super Admins'),
    '550e8400-e29b-41d4-a716-446655440000'
);

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
    runtime_id VARCHAR(100) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    project_id CHAR(36) NOT NULL,
    component_id CHAR(36) NOT NULL,
    environment_id CHAR(36) NOT NULL,
    runtime_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
    version VARCHAR(50),
    runtime_hostname VARCHAR(255),
    runtime_port VARCHAR(10),
    platform_name VARCHAR(50) NOT NULL DEFAULT 'ballerina',
    platform_version VARCHAR(50),
    platform_home VARCHAR(255),
    os_name VARCHAR(50),
    os_version VARCHAR(50),
    carbon_home VARCHAR(500),
    java_vendor VARCHAR(100),
    java_version VARCHAR(50),
    total_memory BIGINT,
    free_memory BIGINT,
    max_memory BIGINT,
    used_memory BIGINT,
    os_arch VARCHAR(50),
    server_name VARCHAR(200),
    registration_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_runtime_project FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_runtime_component FOREIGN KEY (component_id) REFERENCES components (component_id) ON DELETE CASCADE,
    CONSTRAINT fk_runtime_env FOREIGN KEY (environment_id) REFERENCES environments (environment_id) ON DELETE CASCADE
);

CREATE INDEX idx_runtimes_runtime_type ON runtimes (runtime_type);

CREATE INDEX idx_runtimes_status ON runtimes (status);

CREATE INDEX idx_runtimes_env ON runtimes (environment_id);

CREATE INDEX idx_runtimes_component ON runtimes (component_id);

CREATE INDEX idx_runtimes_project ON runtimes (project_id);

CREATE INDEX idx_runtimes_last_heartbeat ON runtimes (last_heartbeat);

CREATE INDEX idx_runtimes_registration_time ON runtimes (registration_time);

-- Per-component-per-environment JWT HMAC secret
-- Generated when a component is first deployed to an environment; used to
-- validate incoming heartbeat JWTs from that specific component+environment pair.
CREATE TABLE component_environment_secrets (
    component_id CHAR(36) NOT NULL,
    environment_id CHAR(36) NOT NULL,
    jwt_hmac_secret VARCHAR(256) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (component_id, environment_id),
    CONSTRAINT fk_ces_component FOREIGN KEY (component_id) REFERENCES components (component_id) ON DELETE CASCADE,
    CONSTRAINT fk_ces_environment FOREIGN KEY (environment_id) REFERENCES environments (environment_id) ON DELETE CASCADE
);

-- Services deployed on a runtime
CREATE TABLE bi_service_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    service_package VARCHAR(200) NOT NULL,
    base_path VARCHAR(500),
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, service_name, service_package),
    CONSTRAINT fk_bi_service_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_bi_service_artifacts_runtime_id ON bi_service_artifacts (runtime_id);

CREATE INDEX idx_bi_service_artifacts_service_name ON bi_service_artifacts (service_name);

CREATE INDEX idx_bi_service_artifacts_service_package ON bi_service_artifacts (service_package);

CREATE INDEX idx_bi_service_artifacts_state ON bi_service_artifacts (state);

-- Resources inside a service (HTTP resources etc.)
CREATE TABLE bi_service_resource_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    resource_url VARCHAR(1000) NOT NULL,
    methods CLOB NOT NULL,
    method_first VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, service_name, resource_url),
    CONSTRAINT fk_bi_service_resource_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_bi_service_resource_artifacts_runtime_service ON bi_service_resource_artifacts (runtime_id, service_name);

CREATE INDEX idx_bi_service_resource_artifacts_resource_url ON bi_service_resource_artifacts (resource_url);

CREATE INDEX idx_bi_service_resource_artifacts_method_first ON bi_service_resource_artifacts (method_first);

-- Listeners bound to a runtime (e.g., HTTP/HTTPS)
CREATE TABLE bi_runtime_listener_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    listener_name VARCHAR(100) NOT NULL,
    listener_package VARCHAR(200) NOT NULL,
    protocol VARCHAR(20) DEFAULT 'HTTP',
    listener_host VARCHAR(100),
    listener_port INT,
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, listener_name),
    CONSTRAINT fk_bi_runtime_listener_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_bi_runtime_listener_artifacts_runtime_id ON bi_runtime_listener_artifacts (runtime_id);

CREATE INDEX idx_bi_runtime_listener_artifacts_listener_name ON bi_runtime_listener_artifacts (listener_name);

CREATE INDEX idx_bi_runtime_listener_artifacts_protocol ON bi_runtime_listener_artifacts (protocol);

CREATE INDEX idx_bi_runtime_listener_artifacts_state ON bi_runtime_listener_artifacts (state);

-- Automation artifacts (main function) for BI integrations
CREATE TABLE bi_automation_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    package_org VARCHAR(200) NOT NULL,
    package_name VARCHAR(200) NOT NULL,
    package_version VARCHAR(50) NOT NULL,
    execution_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, execution_timestamp),
    CONSTRAINT fk_bi_automation_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_bi_automation_artifacts_runtime_id ON bi_automation_artifacts (runtime_id);

CREATE INDEX idx_bi_automation_artifacts_package_name ON bi_automation_artifacts (package_name);

CREATE INDEX idx_bi_automation_artifacts_execution_timestamp ON bi_automation_artifacts (execution_timestamp);

-- Runtime log levels for BI components
CREATE TABLE bi_runtime_log_levels (
    runtime_id VARCHAR(100) NOT NULL,
    component_name VARCHAR(200) NOT NULL,
    log_level VARCHAR(20) NOT NULL CHECK (log_level IN ('DEBUG', 'ERROR', 'INFO', 'WARN')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, component_name),
    CONSTRAINT fk_bi_runtime_log_levels_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_bi_runtime_log_levels_runtime_id ON bi_runtime_log_levels (runtime_id);

CREATE INDEX idx_bi_runtime_log_levels_component_name ON bi_runtime_log_levels (component_name);

CREATE INDEX idx_bi_runtime_log_levels_log_level ON bi_runtime_log_levels (log_level);

-- ============================================================================
-- MI-SPECIFIC ARTIFACT TABLES
-- ============================================================================

CREATE TABLE mi_api_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    api_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    url VARCHAR(500) NOT NULL,
    urls CLOB, -- JSON array of URLs
    context VARCHAR(500) NOT NULL,
    version VARCHAR(50),
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    statistics VARCHAR(20) NOT NULL DEFAULT 'disabled',
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, api_name),
    CONSTRAINT fk_mi_api_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_api_artifacts_runtime_id ON mi_api_artifacts (runtime_id);

CREATE INDEX idx_mi_api_artifacts_api_name ON mi_api_artifacts (api_name);

CREATE INDEX idx_mi_api_artifacts_artifact_id ON mi_api_artifacts (artifact_id);

CREATE INDEX idx_mi_api_artifacts_state ON mi_api_artifacts (state);

-- API Resources (MI) - Resources inside an API
CREATE TABLE mi_api_resource_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    api_name VARCHAR(200) NOT NULL,
    resource_path VARCHAR(1000) NOT NULL,
    methods VARCHAR(20) NOT NULL, -- Single HTTP method as string (e.g., "POST", "GET")
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, api_name, resource_path),
    CONSTRAINT fk_mi_api_resource_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_api_resource_artifacts_runtime_api ON mi_api_resource_artifacts (runtime_id, api_name);

CREATE INDEX idx_mi_api_resource_artifacts_resource_path ON mi_api_resource_artifacts (resource_path);

CREATE INDEX idx_mi_api_resource_artifacts_methods ON mi_api_resource_artifacts (methods);

-- Proxy Services (MI)
CREATE TABLE mi_proxy_service_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    proxy_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    statistics VARCHAR(20) NOT NULL DEFAULT 'disabled',
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, proxy_name),
    CONSTRAINT fk_mi_proxy_service_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_proxy_service_artifacts_runtime_id ON mi_proxy_service_artifacts (runtime_id);

CREATE INDEX idx_mi_proxy_service_artifacts_proxy_name ON mi_proxy_service_artifacts (proxy_name);

CREATE INDEX idx_mi_proxy_service_artifacts_artifact_id ON mi_proxy_service_artifacts (artifact_id);

CREATE INDEX idx_mi_proxy_service_artifacts_state ON mi_proxy_service_artifacts (state);

-- Proxy Service Endpoints (MI)
CREATE TABLE mi_proxy_service_endpoint_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    proxy_name VARCHAR(200) NOT NULL,
    endpoint_url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, proxy_name, endpoint_url),
    CONSTRAINT fk_mi_proxy_service_endpoint_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_proxy_service_endpoint_artifacts_runtime_id ON mi_proxy_service_endpoint_artifacts (runtime_id);
CREATE INDEX idx_mi_proxy_service_endpoint_artifacts_proxy_name ON mi_proxy_service_endpoint_artifacts (proxy_name);

-- Endpoints (MI)
CREATE TABLE mi_endpoint_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    endpoint_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    endpoint_type VARCHAR(100) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    statistics VARCHAR(20) NOT NULL DEFAULT 'disabled',
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, endpoint_name),
    CONSTRAINT fk_mi_endpoint_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

-- Endpoint Attributes (MI)
CREATE TABLE mi_endpoint_attribute_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    endpoint_name VARCHAR(200) NOT NULL,
    attribute_name VARCHAR(200) NOT NULL,
    attribute_value TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, endpoint_name, attribute_name),
    CONSTRAINT fk_mi_endpoint_attribute_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_endpoint_attribute_artifacts_runtime_id ON mi_endpoint_attribute_artifacts (runtime_id);
CREATE INDEX idx_mi_endpoint_attribute_artifacts_endpoint_name ON mi_endpoint_attribute_artifacts (endpoint_name);
CREATE INDEX idx_mi_endpoint_attribute_artifacts_attribute_name ON mi_endpoint_attribute_artifacts (attribute_name);

CREATE INDEX idx_mi_endpoint_artifacts_runtime_id ON mi_endpoint_artifacts (runtime_id);

CREATE INDEX idx_mi_endpoint_artifacts_endpoint_name ON mi_endpoint_artifacts (endpoint_name);

CREATE INDEX idx_mi_endpoint_artifacts_artifact_id ON mi_endpoint_artifacts (artifact_id);

CREATE INDEX idx_mi_endpoint_artifacts_endpoint_type ON mi_endpoint_artifacts (endpoint_type);

CREATE INDEX idx_mi_endpoint_artifacts_state ON mi_endpoint_artifacts (state);

-- Inbound Endpoints (MI)
CREATE TABLE mi_inbound_endpoint_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    inbound_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    protocol VARCHAR(50) NOT NULL,
    sequence VARCHAR(200),
    statistics VARCHAR(20),
    on_error VARCHAR(200),
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, inbound_name),
    CONSTRAINT fk_mi_inbound_endpoint_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_inbound_endpoint_artifacts_runtime_id ON mi_inbound_endpoint_artifacts (runtime_id);

CREATE INDEX idx_mi_inbound_endpoint_artifacts_inbound_name ON mi_inbound_endpoint_artifacts (inbound_name);

CREATE INDEX idx_mi_inbound_endpoint_artifacts_artifact_id ON mi_inbound_endpoint_artifacts (artifact_id);

CREATE INDEX idx_mi_inbound_endpoint_artifacts_protocol ON mi_inbound_endpoint_artifacts (protocol);

CREATE INDEX idx_mi_inbound_endpoint_artifacts_state ON mi_inbound_endpoint_artifacts (state);

-- Sequences (MI)
CREATE TABLE mi_sequence_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    sequence_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    sequence_type VARCHAR(100),
    container VARCHAR(200),
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    statistics VARCHAR(20) NOT NULL DEFAULT 'disabled',
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, sequence_name),
    CONSTRAINT fk_mi_sequence_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_sequence_artifacts_runtime_id ON mi_sequence_artifacts (runtime_id);

CREATE INDEX idx_mi_sequence_artifacts_sequence_name ON mi_sequence_artifacts (sequence_name);

CREATE INDEX idx_mi_sequence_artifacts_artifact_id ON mi_sequence_artifacts (artifact_id);

CREATE INDEX idx_mi_sequence_artifacts_sequence_type ON mi_sequence_artifacts (sequence_type);

CREATE INDEX idx_mi_sequence_artifacts_state ON mi_sequence_artifacts (state);

-- Tasks (MI)
CREATE TABLE mi_task_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    task_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    task_class VARCHAR(500),
    task_group VARCHAR(200),
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, task_name),
    CONSTRAINT fk_mi_task_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_task_artifacts_runtime_id ON mi_task_artifacts (runtime_id);

CREATE INDEX idx_mi_task_artifacts_task_name ON mi_task_artifacts (task_name);

CREATE INDEX idx_mi_task_artifacts_artifact_id ON mi_task_artifacts (artifact_id);

CREATE INDEX idx_mi_task_artifacts_state ON mi_task_artifacts (state);

-- Templates (MI)
CREATE TABLE mi_template_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    template_name VARCHAR(200) NOT NULL,
    template_type VARCHAR(100) NOT NULL,
    tracing VARCHAR(20) NOT NULL DEFAULT 'disabled',
    statistics VARCHAR(20) NOT NULL DEFAULT 'disabled',
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, template_name),
    CONSTRAINT fk_mi_template_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_template_artifacts_runtime_id ON mi_template_artifacts (runtime_id);

CREATE INDEX idx_mi_template_artifacts_template_name ON mi_template_artifacts (template_name);

CREATE INDEX idx_mi_template_artifacts_template_type ON mi_template_artifacts (template_type);

-- state column removed for templates; no index needed

-- Message Stores (MI)
CREATE TABLE mi_message_store_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    store_name VARCHAR(200) NOT NULL,
    store_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, store_name),
    CONSTRAINT fk_mi_message_store_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_message_store_artifacts_runtime_id ON mi_message_store_artifacts (runtime_id);

CREATE INDEX idx_mi_message_store_artifacts_store_name ON mi_message_store_artifacts (store_name);

CREATE INDEX idx_mi_message_store_artifacts_store_type ON mi_message_store_artifacts (store_type);
-- No state persisted for message stores; size is stored instead.

-- Message Processors (MI)
CREATE TABLE mi_message_processor_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    processor_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    processor_type VARCHAR(100) NOT NULL,
    processor_class VARCHAR(500),
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, processor_name),
    CONSTRAINT fk_mi_message_processor_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_message_processor_artifacts_runtime_id ON mi_message_processor_artifacts (runtime_id);

CREATE INDEX idx_mi_message_processor_artifacts_processor_name ON mi_message_processor_artifacts (processor_name);

CREATE INDEX idx_mi_message_processor_artifacts_artifact_id ON mi_message_processor_artifacts (artifact_id);

CREATE INDEX idx_mi_message_processor_artifacts_processor_type ON mi_message_processor_artifacts (processor_type);

CREATE INDEX idx_mi_message_processor_artifacts_state ON mi_message_processor_artifacts (state);

-- Local Entries (MI)
CREATE TABLE mi_local_entry_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    entry_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    entry_type VARCHAR(100) NOT NULL,
    entry_value TEXT,
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, entry_name),
    CONSTRAINT fk_mi_local_entry_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_local_entry_artifacts_runtime_id ON mi_local_entry_artifacts (runtime_id);

CREATE INDEX idx_mi_local_entry_artifacts_entry_name ON mi_local_entry_artifacts (entry_name);

CREATE INDEX idx_mi_local_entry_artifacts_artifact_id ON mi_local_entry_artifacts (artifact_id);

CREATE INDEX idx_mi_local_entry_artifacts_entry_type ON mi_local_entry_artifacts (entry_type);

CREATE INDEX idx_mi_local_entry_artifacts_state ON mi_local_entry_artifacts (state);

-- Data Services (MI)
CREATE TABLE mi_data_service_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    service_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    description TEXT,
    wsdl TEXT,
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    carbon_app VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, service_name),
    CONSTRAINT fk_mi_data_service_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_data_service_artifacts_runtime_id ON mi_data_service_artifacts (runtime_id);

CREATE INDEX idx_mi_data_service_artifacts_service_name ON mi_data_service_artifacts (service_name);

CREATE INDEX idx_mi_data_service_artifacts_artifact_id ON mi_data_service_artifacts (artifact_id);

CREATE INDEX idx_mi_data_service_artifacts_state ON mi_data_service_artifacts (state);

-- Carbon Apps (MI)
CREATE TABLE mi_carbon_app_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    app_name VARCHAR(200) NOT NULL,
    version VARCHAR(50),
    state VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (state IN ('Active', 'Faulty')),
    artifacts VARCHAR(4000), -- JSON array serialized as string (convert to JSON in app code when needed)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, app_name),
    CONSTRAINT fk_mi_carbon_app_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_carbon_app_artifacts_runtime_id ON mi_carbon_app_artifacts (runtime_id);

CREATE INDEX idx_mi_carbon_app_artifacts_app_name ON mi_carbon_app_artifacts (app_name);

CREATE INDEX idx_mi_carbon_app_artifacts_state ON mi_carbon_app_artifacts (state);

-- Data Sources (MI)
CREATE TABLE mi_data_source_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    datasource_name VARCHAR(200) NOT NULL,
    datasource_type VARCHAR(100),
    driver VARCHAR(500),
    url VARCHAR(1000),
    username VARCHAR(255),
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, datasource_name),
    CONSTRAINT fk_mi_data_source_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_data_source_artifacts_runtime_id ON mi_data_source_artifacts (runtime_id);

CREATE INDEX idx_mi_data_source_artifacts_datasource_name ON mi_data_source_artifacts (datasource_name);

CREATE INDEX idx_mi_data_source_artifacts_datasource_type ON mi_data_source_artifacts (datasource_type);

CREATE INDEX idx_mi_data_source_artifacts_state ON mi_data_source_artifacts (state);

-- Connectors (MI)
CREATE TABLE mi_connector_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    connector_name VARCHAR(200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    package VARCHAR(200) NOT NULL,
    version VARCHAR(50),
    state VARCHAR(20) NOT NULL DEFAULT 'enabled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, connector_name, package),
    CONSTRAINT fk_mi_connector_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_connector_artifacts_runtime_id ON mi_connector_artifacts (runtime_id);

CREATE INDEX idx_mi_connector_artifacts_connector_name ON mi_connector_artifacts (connector_name);

CREATE INDEX idx_mi_connector_artifacts_artifact_id ON mi_connector_artifacts (artifact_id);

CREATE INDEX idx_mi_connector_artifacts_state ON mi_connector_artifacts (state);

-- Registry Resources (MI)
CREATE TABLE mi_registry_resource_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    resource_name VARCHAR(200) NOT NULL,
    resource_type VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, resource_name),
    CONSTRAINT fk_mi_registry_resource_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_mi_registry_resource_artifacts_runtime_id ON mi_registry_resource_artifacts (runtime_id);

CREATE INDEX idx_mi_registry_resource_artifacts_resource_name ON mi_registry_resource_artifacts (resource_name);

-- ============================================================================
-- CONTROL COMMANDS
-- ============================================================================

CREATE TABLE mi_runtime_control_commands (
    runtime_id VARCHAR(100) NOT NULL,
    component_id CHAR(36) NOT NULL,
    artifact_name VARCHAR(200) NOT NULL,
    artifact_type VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    issued_by CHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, component_id, artifact_name, artifact_type),
    CONSTRAINT fk_mi_runtime_control_cmd_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    CONSTRAINT fk_mi_runtime_control_cmd_component FOREIGN KEY (component_id) REFERENCES components (component_id) ON DELETE CASCADE,
    CONSTRAINT fk_mi_runtime_control_cmd_issued_by FOREIGN KEY (issued_by) REFERENCES users (user_id) ON DELETE SET NULL
);

CREATE INDEX idx_mi_runtime_control_commands_runtime_id ON mi_runtime_control_commands (runtime_id);

CREATE INDEX idx_mi_runtime_control_commands_component_id ON mi_runtime_control_commands (component_id);


CREATE INDEX idx_mi_runtime_control_commands_status ON mi_runtime_control_commands (status);

CREATE INDEX idx_mi_runtime_control_commands_issued_at ON mi_runtime_control_commands (issued_at);

CREATE INDEX idx_mi_runtime_control_commands_action ON mi_runtime_control_commands (action);

CREATE INDEX idx_mi_runtime_control_commands_issued_by ON mi_runtime_control_commands (issued_by);


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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (component_id, env_id, artifact_name, artifact_type, state_key)
);

CREATE TABLE reconcile_observed_state (
    runtime_id VARCHAR(100) NOT NULL,
    component_id CHAR(36) NOT NULL,
    env_id CHAR(36) NOT NULL,
    artifact_name VARCHAR(200) NOT NULL,
    artifact_type VARCHAR(100) NOT NULL,
    state_key VARCHAR(255) NOT NULL,
    state_value VARCHAR(1024),
    optimistic BOOLEAN NOT NULL DEFAULT FALSE,
    heartbeat_gen BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (runtime_id, artifact_name, artifact_type, state_key)
);

CREATE TABLE reconcile_backoff (
    runtime_id VARCHAR(100) NOT NULL,
    artifact_name VARCHAR(200) NOT NULL,
    artifact_type VARCHAR(100) NOT NULL,
    state_key VARCHAR(255) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    has_error INT NOT NULL DEFAULT 0,
    next_attempt BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (runtime_id, artifact_name, artifact_type, state_key)
);

-- ============================================================================
-- AUDIT & EVENTS
-- ============================================================================

CREATE TABLE audit_logs (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    runtime_id VARCHAR(100),
    user_id CHAR(36),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(200),
    details TEXT,
    client_ip VARCHAR(45),
    user_agent VARCHAR(500),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_logs_runtime_id ON audit_logs (runtime_id);

CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);

CREATE INDEX idx_audit_logs_action ON audit_logs (action);

CREATE INDEX idx_audit_logs_resource_type ON audit_logs (resource_type);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs (timestamp);

CREATE INDEX idx_audit_logs_client_ip ON audit_logs (client_ip);

CREATE TABLE system_events (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
    source VARCHAR(100),
    message TEXT NOT NULL,
    metadata CLOB,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by CHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sys_events_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (user_id) ON DELETE SET NULL
);

CREATE INDEX idx_system_events_event_type ON system_events (event_type);

CREATE INDEX idx_system_events_severity ON system_events (severity);

CREATE INDEX idx_system_events_source ON system_events (source);

CREATE INDEX idx_system_events_resolved ON system_events (resolved);

CREATE INDEX idx_system_events_created_at ON system_events (created_at);

-- ============================================================================
-- MONITORING & HEALTH
-- ============================================================================

CREATE TABLE runtime_metrics (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    runtime_id VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15, 4) NOT NULL,
    metric_unit VARCHAR(20),
    tags CLOB,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_metrics_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_runtime_metrics_runtime_metric ON runtime_metrics (runtime_id, metric_name);

CREATE INDEX idx_runtime_metrics_timestamp ON runtime_metrics (timestamp);

CREATE INDEX idx_runtime_metrics_metric_name ON runtime_metrics (metric_name);

CREATE TABLE health_checks (
    id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    runtime_id VARCHAR(100) NOT NULL,
    check_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    response_time_ms INT,
    error_message TEXT,
    details CLOB,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_health_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
);

CREATE INDEX idx_health_checks_runtime_check ON health_checks (runtime_id, check_type);

CREATE INDEX idx_health_checks_status ON health_checks (status);

CREATE INDEX idx_health_checks_timestamp ON health_checks (timestamp);

-- ============================================================================
-- SYSTEM CONFIG
-- ============================================================================

CREATE TABLE system_config (
    config_key VARCHAR(100) NOT NULL PRIMARY KEY,
    config_value TEXT NOT NULL,
    config_type VARCHAR(20) NOT NULL DEFAULT 'STRING',
    description TEXT,
    is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by CHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_syscfg_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE SET NULL
);

CREATE INDEX idx_system_config_config_type ON system_config (config_type);

CREATE INDEX idx_system_config_updated_at ON system_config (updated_at);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- ============================================================================
-- SAMPLE DATA FOR TESTING
-- ============================================================================

-- Note: Default organization and super admin user are created in RBAC V2 SEED DATA section above

-- Insert sample project
INSERT INTO
    projects (
        project_id,
        org_id,
        name,
        version,
        handler,
        region,
        description,
        type,
        git_provider,
        git_organization,
        repository,
        branch,
        owner_id,
        created_by
    )
VALUES (
        '650e8400-e29b-41d4-a716-446655440001',
        1,
        'Sample Project',
        '1.0.0',
        'sample-project',
        'us-west-2',
        'Sample project for testing',
        'web-application',
        'github',
        'sample-org',
        'sample-repo',
        'main',
        '550e8400-e29b-41d4-a716-446655440000',
        'System Administrator'
    ),
    (
        '650e8400-e29b-41d4-a716-446655440002',
        1,
        'Sample Project 2',
        '1.1.0',
        'sample-project-2',
        'eu-west-1',
        'Second sample project for testing',
        'api-service',
        'gitlab',
        'test-org',
        'test-repo',
        'develop',
        '550e8400-e29b-41d4-a716-446655440000',
        'System Administrator'
    );

INSERT INTO
    components (
        component_id,
        name,
        display_name,
        component_type,
        description,
        created_by,
        project_id
    )
VALUES (
        '640e8400-e29b-41d4-a716-446655440001',
        'sample-integration',
        'Sample Integration',
        'BI',
        'Sample integration for testing',
        '550e8400-e29b-41d4-a716-446655440000',
        '650e8400-e29b-41d4-a716-446655440001'
    );

-- Insert sample environments
INSERT INTO
    environments (
        environment_id,
        name,
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
        'Development environment',
        'us-east-1',
        'cluster-abc123',
        'dev',
        'dev-external',
        'dev-internal',
        'dev-sandbox',
        FALSE,
        'dev',
        '550e8400-e29b-41d4-a716-446655440000'
    ),
    (
        '750e8400-e29b-41d4-a716-446655440002',
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
        '550e8400-e29b-41d4-a716-446655440000'
    );

-- Insert sample refresh token for admin user (for testing)
INSERT INTO
    refresh_tokens (
        token_id,
        user_id,
        token_hash,
        expires_at,
        user_agent,
        ip_address
    )
VALUES (
        '950e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440000',
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        DATEADD ('DAY', 7, NOW()),
        'Mozilla/5.0 (Test Browser)',
        '127.0.0.1'
    );
