-- ============================================================================
-- ICP Server MSSQL Database Schema (SQL Server 2019+)
-- ============================================================================

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================

CREATE TABLE organizations (
    org_id INT NOT NULL IDENTITY (1, 1) PRIMARY KEY,
    org_name NVARCHAR (255) NOT NULL UNIQUE,
    org_handle NVARCHAR (100) NOT NULL UNIQUE,
    description NVARCHAR (MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    INDEX idx_org_handle (org_handle)
);
GO

-- Trigger for updated_at on organizations
CREATE TRIGGER trg_organizations_updated_at
ON organizations
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE organizations
    SET updated_at = GETDATE()
    FROM organizations o
    INNER JOIN inserted i ON o.org_id = i.org_id;
END;
GO

-- ============================================================================
-- USER MANAGEMENT & AUTHZ
-- ============================================================================

CREATE TABLE users (
    user_id CHAR(36) NOT NULL PRIMARY KEY,
    username NVARCHAR (255) NOT NULL UNIQUE,
    display_name NVARCHAR (200) NOT NULL,
    is_super_admin BIT NOT NULL DEFAULT 0,
    is_project_author BIT NOT NULL DEFAULT 0,
    is_oidc_user BIT NOT NULL DEFAULT 0,
    require_password_change BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    INDEX idx_username (username),
    INDEX idx_super_admin (is_super_admin),
    INDEX idx_project_author (is_project_author)
);
GO

CREATE TRIGGER trg_users_updated_at
ON users
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE users
    SET updated_at = GETDATE()
    FROM users u
    INNER JOIN inserted i ON u.user_id = i.user_id;
END;
GO

-- ============================================================================
-- REFRESH TOKENS (for authentication session management)
-- ============================================================================

CREATE TABLE refresh_tokens (
    token_id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash NVARCHAR (255) NOT NULL UNIQUE, -- SHA256 hash of token
    expires_at DATETIME2 NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    last_used_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    revoked BIT NOT NULL DEFAULT 0,
    revoked_at DATETIME2 NULL,
    user_agent NVARCHAR (500) NULL,
    ip_address NVARCHAR (50) NULL,
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_token_hash (token_hash),
    INDEX idx_expires_at (expires_at),
    INDEX idx_revoked (revoked)
);
GO

CREATE TRIGGER trg_refresh_tokens_last_used_at
ON refresh_tokens
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE refresh_tokens
    SET last_used_at = GETDATE()
    FROM refresh_tokens rt
    INNER JOIN inserted i ON rt.token_id = i.token_id;
END;
GO

-- ============================================================================
-- PROJECTS / COMPONENTS / ENVIRONMENTS
-- ============================================================================

CREATE TABLE projects (
    project_id CHAR(36) PRIMARY KEY,
    org_id INT NOT NULL,
    name NVARCHAR (100) NOT NULL,
    version NVARCHAR (50) NULL DEFAULT '1.0.0',
    created_date DATETIME2 DEFAULT GETDATE (),
    handler NVARCHAR (200) NOT NULL,
    region NVARCHAR (100) NULL,
    description NVARCHAR (MAX),
    default_deployment_pipeline_id CHAR(36) NULL,
    deployment_pipeline_ids NVARCHAR (MAX) NULL, -- JSON stored as NVARCHAR
    type NVARCHAR (50) NULL,
    git_provider NVARCHAR (50) NULL,
    git_organization NVARCHAR (200) NULL,
    repository NVARCHAR (200) NULL,
    branch NVARCHAR (100) NULL,
    secret_ref NVARCHAR (200) NULL,
    owner_id CHAR(36) NULL, -- User ID of the project owner
    created_by NVARCHAR (200) NULL, -- Display name of who created the project
    updated_by NVARCHAR (200) NULL, -- Display name of who last updated the project
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_projects_org FOREIGN KEY (org_id) REFERENCES organizations (org_id),
    CONSTRAINT uk_project_name_org UNIQUE (org_id, name), -- Allow same name in different orgs
    INDEX idx_owner_id (owner_id),
    INDEX idx_org_id (org_id),
    INDEX idx_handler (
        handler
    )
);
GO

CREATE TRIGGER trg_projects_updated_at
ON projects
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE projects
    SET updated_at = GETDATE()
    FROM projects p
    INNER JOIN inserted i ON p.project_id = i.project_id;
END;
GO

-- Components belong to projects; users create components.
CREATE TABLE components (
    component_id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    name NVARCHAR (150) NOT NULL,
    display_name NVARCHAR (200) NOT NULL,
    description NVARCHAR (MAX) NULL,
    component_type NVARCHAR (10) NOT NULL DEFAULT 'BI' CHECK (
        component_type IN ('MI', 'BI')
    ),
    created_by CHAR(36) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_by CHAR(36) NULL,
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT fk_components_project FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_components_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_components_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id),
    -- Prevent duplicate component names within the same project
    CONSTRAINT uk_component_project_name UNIQUE (project_id, name),
    INDEX idx_project_id (project_id)
);
GO

-- Workaround for multiple CASCADE paths
ALTER TABLE components DROP CONSTRAINT fk_components_updated_by;

ALTER TABLE components
ADD CONSTRAINT fk_components_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE NO ACTION;
GO

CREATE TRIGGER trg_components_updated_at
ON components
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE components
    SET updated_at = GETDATE()
    FROM components c
    INNER JOIN inserted i ON c.component_id = i.component_id;
END;
GO

CREATE TABLE environments (
    environment_id CHAR(36) PRIMARY KEY,
    name NVARCHAR (200) NOT NULL UNIQUE, -- e.g., dev, stage, prod
    description NVARCHAR (MAX) NULL,
    region NVARCHAR (100) NULL,
    cluster_id NVARCHAR (200) NULL,
    choreo_env NVARCHAR (50) NULL,
    external_apim_env_name NVARCHAR (200) NULL,
    internal_apim_env_name NVARCHAR (200) NULL,
    sandbox_apim_env_name NVARCHAR (200) NULL,
    critical BIT NOT NULL DEFAULT 0,
    dns_prefix NVARCHAR (100) NULL,
    created_by CHAR(36) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_by CHAR(36) NULL,
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT fk_environments_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_environments_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id)
);
GO

-- Workaround for multiple CASCADE paths
ALTER TABLE environments DROP CONSTRAINT fk_environments_updated_by;

ALTER TABLE environments
ADD CONSTRAINT fk_environments_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE NO ACTION;
GO

CREATE TRIGGER trg_environments_updated_at
ON environments
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE environments
    SET updated_at = GETDATE()
    FROM environments e
    INNER JOIN inserted i ON e.environment_id = i.environment_id;
END;
GO

-- ============================================================================
-- ============================================================================
-- RBAC V2 - GROUP-BASED AUTHORIZATION
-- ============================================================================

-- User Groups table
CREATE TABLE user_groups (
    group_id VARCHAR(36) PRIMARY KEY,
    group_name NVARCHAR (255) NOT NULL,
    org_uuid INT NOT NULL DEFAULT 1,
    description NVARCHAR (MAX),
    created_at DATETIME2 DEFAULT GETDATE (),
    updated_at DATETIME2 DEFAULT GETDATE (),
    CONSTRAINT fk_user_groups_org FOREIGN KEY (org_uuid) REFERENCES organizations (org_id) ON DELETE CASCADE,
    INDEX idx_org_uuid (org_uuid),
    INDEX idx_group_name (group_name)
);
GO

CREATE TRIGGER trg_user_groups_updated_at
ON user_groups
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE user_groups
    SET updated_at = GETDATE()
    FROM user_groups ug
    INNER JOIN inserted i ON ug.group_id = i.group_id;
END;
GO

-- Roles v2 table (new structure for permission-based RBAC)
CREATE TABLE roles_v2 (
    role_id VARCHAR(36) PRIMARY KEY,
    role_name NVARCHAR (255) NOT NULL,
    org_id INT NOT NULL DEFAULT 1,
    description NVARCHAR (MAX),
    created_at DATETIME2 DEFAULT GETDATE (),
    updated_at DATETIME2 DEFAULT GETDATE (),
    CONSTRAINT fk_roles_v2_org FOREIGN KEY (org_id) REFERENCES organizations (org_id) ON DELETE CASCADE,
    CONSTRAINT unique_role_name_org UNIQUE (role_name, org_id),
    INDEX idx_role_name (role_name),
    INDEX idx_org_id (org_id)
);
GO

CREATE TRIGGER trg_roles_v2_updated_at
ON roles_v2
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE roles_v2
    SET updated_at = GETDATE()
    FROM roles_v2 r
    INNER JOIN inserted i ON r.role_id = i.role_id;
END;
GO

-- Permissions table with domain grouping
CREATE TABLE permissions (
    permission_id VARCHAR(36) PRIMARY KEY,
    permission_name NVARCHAR (255) NOT NULL UNIQUE,
    permission_domain NVARCHAR (50) NOT NULL CHECK (
        permission_domain IN (
            'Integration-Management',
            'Environment-Management',
            'Observability-Management',
            'Project-Management',
            'User-Management'
        )
    ),
    resource_type NVARCHAR (100) NOT NULL,
    action NVARCHAR (100) NOT NULL,
    description NVARCHAR (MAX),
    created_at DATETIME2 DEFAULT GETDATE (),
    updated_at DATETIME2 DEFAULT GETDATE (),
    INDEX idx_permission_domain (permission_domain),
    INDEX idx_resource_type (resource_type),
    INDEX idx_permission_name (permission_name)
);
GO

CREATE TRIGGER trg_permissions_updated_at
ON permissions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE permissions
    SET updated_at = GETDATE()
    FROM permissions p
    INNER JOIN inserted i ON p.permission_id = i.permission_id;
END;
GO

-- Group-User mapping (Many-to-Many)
CREATE TABLE group_user_mapping (
    id BIGINT IDENTITY (1, 1) PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    user_uuid CHAR(36) NOT NULL,
    created_at DATETIME2 DEFAULT GETDATE (),
    CONSTRAINT fk_group_user_group FOREIGN KEY (group_id) REFERENCES user_groups (group_id) ON DELETE CASCADE,
    CONSTRAINT fk_group_user_user FOREIGN KEY (user_uuid) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT unique_group_user UNIQUE (group_id, user_uuid),
    INDEX idx_user_uuid (user_uuid),
    INDEX idx_group_id (group_id)
);
GO

-- Group-Role mapping with context (Many-to-Many with hierarchical scoping)
CREATE TABLE group_role_mapping (
    id BIGINT IDENTITY (1, 1) PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    role_id VARCHAR(36) NOT NULL,
    org_uuid INT NULL,
    project_uuid CHAR(36) NULL,
    env_uuid CHAR(36) NULL,
    integration_uuid CHAR(36) NULL,
    created_at DATETIME2 DEFAULT GETDATE (),
    CONSTRAINT fk_grp_role_group FOREIGN KEY (group_id) REFERENCES user_groups (group_id) ON DELETE CASCADE,
    CONSTRAINT fk_grp_role_role FOREIGN KEY (role_id) REFERENCES roles_v2 (role_id) ON DELETE NO ACTION,
    CONSTRAINT fk_grp_role_org FOREIGN KEY (org_uuid) REFERENCES organizations (org_id) ON DELETE NO ACTION,
    CONSTRAINT fk_grp_role_project FOREIGN KEY (project_uuid) REFERENCES projects (project_id) ON DELETE NO ACTION,
    CONSTRAINT fk_grp_role_env FOREIGN KEY (env_uuid) REFERENCES environments (environment_id) ON DELETE NO ACTION,
    CONSTRAINT fk_grp_role_integration FOREIGN KEY (integration_uuid) REFERENCES components (component_id) ON DELETE NO ACTION,
    -- Integration access requires project for navigation
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
    ),
    INDEX idx_group_id (group_id),
    INDEX idx_role_id (role_id),
    INDEX idx_org_uuid (org_uuid),
    INDEX idx_project_uuid (project_uuid),
    INDEX idx_env_uuid (env_uuid),
    INDEX idx_integration_uuid (integration_uuid),
    INDEX idx_group_project (group_id, project_uuid),
    INDEX idx_group_env (group_id, env_uuid)
);
GO

-- CASCADE paths resolved by using NO ACTION on foreign keys above
GO

-- Role-Permission mapping (Many-to-Many)
CREATE TABLE role_permission_mapping (
    id BIGINT IDENTITY (1, 1) PRIMARY KEY,
    role_id VARCHAR(36) NOT NULL,
    permission_id VARCHAR(36) NOT NULL,
    created_at DATETIME2 DEFAULT GETDATE (),
    CONSTRAINT fk_role_perm_role FOREIGN KEY (role_id) REFERENCES roles_v2 (role_id) ON DELETE CASCADE,
    CONSTRAINT fk_role_perm_permission FOREIGN KEY (permission_id) REFERENCES permissions (permission_id) ON DELETE CASCADE,
    CONSTRAINT unique_role_permission UNIQUE (role_id, permission_id),
    INDEX idx_role_id (role_id),
    INDEX idx_permission_id (permission_id)
);
GO

-- ============================================================================
-- RBAC V2 VIEWS
-- ============================================================================

-- View: User's accessible projects
GO
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
GO

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
GO

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
GO

-- ============================================================================
-- RBAC V2 SEED DATA
-- ============================================================================

-- Insert default organization (required for foreign key constraints)
SET IDENTITY_INSERT organizations ON;

INSERT INTO
    organizations (org_id, org_name, org_handle)
VALUES (
        1,
        'Default Organization',
        'default'
    );

SET IDENTITY_INSERT organizations OFF;
GO

-- Insert pre-defined roles
INSERT INTO
    roles_v2 (
        role_id,
        role_name,
        org_id,
        description
    )
VALUES (
        NEWID (),
        'Super Admin',
        1,
        'Full access to all resources and permissions'
    ),
    (
        NEWID (),
        'Admin',
        1,
        'Administrative access to projects and integrations'
    ),
    (
        NEWID (),
        'Developer',
        1,
        'Development access with limited permissions'
    ),
    (
        NEWID (),
        'Project Admin',
        1,
        'Administrative access to a specific project'
    ),
    (
        NEWID (),
        'Viewer',
        1,
        'Read-only access with view permissions only'
    );
GO

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
        NEWID (),
        'integration_mgt:view',
        'Integration-Management',
        'integration',
        'view',
        'View integrations'
    ),
    (
        NEWID (),
        'integration_mgt:edit',
        'Integration-Management',
        'integration',
        'edit',
        'Edit integrations'
    ),
    (
        NEWID (),
        'integration_mgt:manage',
        'Integration-Management',
        'integration',
        'manage',
        'Create, edit, and delete integrations'
    ),

-- Environment Management
(
    NEWID (),
    'environment_mgt:manage',
    'Environment-Management',
    'environment',
    'manage',
    'Create and delete environments'
),
(
    NEWID (),
    'environment_mgt:manage_nonprod',
    'Environment-Management',
    'environment',
    'manage',
    'Create and delete non-production environments'
),

-- Project Management
(
    NEWID (),
    'project_mgt:view',
    'Project-Management',
    'project',
    'view',
    'View projects'
),
(
    NEWID (),
    'project_mgt:edit',
    'Project-Management',
    'project',
    'edit',
    'Edit projects'
),
(
    NEWID (),
    'project_mgt:manage',
    'Project-Management',
    'project',
    'manage',
    'Create, edit, and delete projects'
),

-- Observability Management
(
    NEWID (),
    'observability_mgt:view_logs',
    'Observability-Management',
    'logs',
    'view',
    'View logs'
),
(
    NEWID (),
    'observability_mgt:view_insights',
    'Observability-Management',
    'insights',
    'view',
    'View insights'
),

-- User Management
(
    NEWID (),
    'user_mgt:manage_users',
    'User-Management',
    'user',
    'manage',
    'Create, update, and delete users'
),
(
    NEWID (),
    'user_mgt:update_users',
    'User-Management',
    'user',
    'update',
    'Assign user groups'
),
(
    NEWID (),
    'user_mgt:manage_groups',
    'User-Management',
    'group',
    'manage',
    'Create, update, and delete groups'
),
(
    NEWID (),
    'user_mgt:manage_roles',
    'User-Management',
    'role',
    'manage',
    'Create, update, and delete roles'
),
(
    NEWID (),
    'user_mgt:update_group_roles',
    'User-Management',
    'group-role',
    'update',
    'Map roles to groups'
);
GO

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
GO

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
GO

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
WHERE
    permission_name IN (
        'integration_mgt:view',
        'integration_mgt:edit',
        'environment_mgt:manage_nonprod',
        'project_mgt:view',
        'project_mgt:edit',
        'observability_mgt:view_logs',
        'observability_mgt:view_insights'
    );
GO

-- Map Project Admin to project-specific admin permissions
INSERT INTO
    role_permission_mapping (role_id, permission_id)
SELECT (
        SELECT role_id
        FROM roles_v2
        WHERE
            role_name = 'Project Admin'
    ), permission_id
FROM permissions
WHERE
    permission_name IN (
        'project_mgt:manage',
        'integration_mgt:manage',
        'user_mgt:update_group_roles'
    );
GO

-- Map Viewer to view-only permissions
INSERT INTO
    role_permission_mapping (role_id, permission_id)
SELECT (
        SELECT role_id
        FROM roles_v2
        WHERE
            role_name = 'Viewer'
    ), permission_id
FROM permissions
WHERE
    permission_name IN (
        'integration_mgt:view',
        'project_mgt:view',
        'observability_mgt:view_logs',
        'observability_mgt:view_insights'
    );
GO

-- Insert default admin user (required for group assignments)
INSERT INTO
    users (
        user_id,
        username,
        display_name,
        is_super_admin
    )
VALUES (
        '550e8400-e29b-41d4-a716-446655440000',
        'admin',
        'System Administrator',
        1
    );
GO

-- Create default groups
INSERT INTO
    user_groups (
        group_id,
        group_name,
        org_uuid,
        description
    )
VALUES (
        NEWID (),
        'Super Admins',
        1,
        'Group for super administrators with full access'
    ),
    (
        NEWID (),
        'Administrators',
        1,
        'Group for administrators'
    ),
    (
        NEWID (),
        'Developers',
        1,
        'Group for developers'
    );
GO

-- Assign super admin user to Super Admins group
INSERT INTO
    group_user_mapping (group_id, user_uuid)
VALUES (
        (
            SELECT group_id
            FROM user_groups
            WHERE
                group_name = 'Super Admins'
        ),
        '550e8400-e29b-41d4-a716-446655440000'
    );
GO

-- Map Super Admins group to Super Admin role at org level
INSERT INTO
    group_role_mapping (group_id, role_id, org_uuid)
VALUES (
        (
            SELECT group_id
            FROM user_groups
            WHERE
                group_name = 'Super Admins'
        ),
        (
            SELECT role_id
            FROM roles_v2
            WHERE
                role_name = 'Super Admin'
        ),
        1
    );
GO

-- ============================================================================
-- RUNTIMES & ARTIFACTS
-- ============================================================================

CREATE TABLE runtimes (
    runtime_id VARCHAR(100) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    project_id CHAR(36) NOT NULL,
    component_id CHAR(36) NOT NULL,
    environment_id CHAR(36) NOT NULL,
    runtime_type NVARCHAR (10) NOT NULL CHECK (runtime_type IN ('MI', 'BI')),
    status NVARCHAR (20) NOT NULL DEFAULT 'OFFLINE' CHECK (
        status IN (
            'RUNNING',
            'FAILED',
            'DISABLED',
            'OFFLINE'
        )
    ),
    version NVARCHAR (50) NULL,
    runtime_hostname NVARCHAR (255) NULL,
    runtime_port NVARCHAR (10) NULL,
    platform_name NVARCHAR (50) NOT NULL DEFAULT 'ballerina',
    platform_version NVARCHAR (50) NULL,
    platform_home NVARCHAR (255) NULL,
    os_name NVARCHAR (50) NULL,
    os_version NVARCHAR (50) NULL,
    carbon_home NVARCHAR (500) NULL,
    java_vendor NVARCHAR (100) NULL,
    java_version NVARCHAR (50) NULL,
    total_memory BIGINT NULL,
    free_memory BIGINT NULL,
    max_memory BIGINT NULL,
    used_memory BIGINT NULL,
    os_arch NVARCHAR (50) NULL,
    server_name NVARCHAR (200) NULL,
    registration_time DATETIME2 (6) NOT NULL DEFAULT SYSDATETIME (),
    last_heartbeat DATETIME2 (6) NOT NULL DEFAULT SYSDATETIME (),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT fk_runtime_project FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_runtime_component FOREIGN KEY (component_id) REFERENCES components (component_id),
    CONSTRAINT fk_runtime_env FOREIGN KEY (environment_id) REFERENCES environments (environment_id),
    INDEX idx_runtime_type (runtime_type),
    INDEX idx_status (status),
    INDEX idx_env (environment_id),
    INDEX idx_component (component_id),
    INDEX idx_project (project_id),
    INDEX idx_last_heartbeat (last_heartbeat),
    INDEX idx_registration_time (registration_time)
);
GO

-- Workaround for multiple CASCADE paths
ALTER TABLE runtimes DROP CONSTRAINT fk_runtime_component;

ALTER TABLE runtimes DROP CONSTRAINT fk_runtime_env;

ALTER TABLE runtimes
ADD CONSTRAINT fk_runtime_component FOREIGN KEY (component_id) REFERENCES components (component_id) ON DELETE NO ACTION;

ALTER TABLE runtimes
ADD CONSTRAINT fk_runtime_env FOREIGN KEY (environment_id) REFERENCES environments (environment_id) ON DELETE NO ACTION;
GO

CREATE TRIGGER trg_runtimes_updated_at
ON runtimes
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE runtimes
    SET updated_at = GETDATE()
    FROM runtimes r
    INNER JOIN inserted i ON r.runtime_id = i.runtime_id;
END;
GO

-- Services deployed on a runtime
CREATE TABLE bi_service_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    service_name NVARCHAR (100) NOT NULL,
    service_package NVARCHAR (200) NOT NULL,
    base_path NVARCHAR (500) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (
        runtime_id,
        service_name,
        service_package
    ),
    CONSTRAINT fk_bi_service_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_service_name (service_name),
    INDEX idx_service_package (service_package),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_bi_service_artifacts_updated_at
ON bi_service_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE bi_service_artifacts
    SET updated_at = GETDATE()
    FROM bi_service_artifacts rs
    INNER JOIN inserted i ON rs.runtime_id = i.runtime_id 
        AND rs.service_name = i.service_name 
        AND rs.service_package = i.service_package;
END;
GO

-- Resources inside a service (HTTP resources etc.)
CREATE TABLE bi_service_resource_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    service_name NVARCHAR (100) NOT NULL,
    resource_url NVARCHAR (300) NOT NULL,
    methods NVARCHAR (MAX) NOT NULL, -- JSON array stored as NVARCHAR
    method_first AS (JSON_VALUE(methods, '$[0]')) PERSISTED,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (
        runtime_id,
        service_name,
        resource_url
    ),
    CONSTRAINT fk_bi_service_resource_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_service (runtime_id, service_name)
);
GO

CREATE TRIGGER trg_bi_service_resource_artifacts_updated_at
ON bi_service_resource_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE bi_service_resource_artifacts
    SET updated_at = GETDATE()
    FROM bi_service_resource_artifacts sr
    INNER JOIN inserted i ON sr.runtime_id = i.runtime_id 
        AND sr.service_name = i.service_name 
        AND sr.resource_url = i.resource_url;
END;
GO

-- Listeners bound to a runtime (e.g., HTTP/HTTPS)
CREATE TABLE bi_runtime_listener_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    listener_name NVARCHAR (100) NOT NULL,
    listener_package NVARCHAR (200) NOT NULL,
    protocol NVARCHAR (20) NULL DEFAULT 'HTTP',
    listener_host NVARCHAR (100),
    listener_port INT,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, listener_name),
    CONSTRAINT fk_bi_runtime_listener_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_listener_name (listener_name),
    INDEX idx_protocol (protocol),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_bi_runtime_listener_artifacts_updated_at
ON bi_runtime_listener_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE bi_runtime_listener_artifacts
    SET updated_at = GETDATE()
    FROM bi_runtime_listener_artifacts rl
    INNER JOIN inserted i ON rl.runtime_id = i.runtime_id 
        AND rl.listener_name = i.listener_name;
END;
GO

-- Automation artifacts (main function) for BI integrations
CREATE TABLE bi_automation_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    package_org NVARCHAR (200) NOT NULL,
    package_name NVARCHAR (200) NOT NULL,
    package_version NVARCHAR (50) NOT NULL,
    execution_timestamp DATETIME2 NOT NULL DEFAULT GETDATE (),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, execution_timestamp),
    CONSTRAINT fk_bi_automation_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_package_name (package_name),
    INDEX idx_execution_timestamp (execution_timestamp)
);
GO

CREATE TRIGGER trg_bi_automation_artifacts_updated_at
ON bi_automation_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE bi_automation_artifacts
    SET updated_at = GETDATE()
    FROM bi_automation_artifacts ba
    INNER JOIN inserted i ON ba.runtime_id = i.runtime_id 
        AND ba.execution_timestamp = i.execution_timestamp;
END;
GO

-- Runtime log levels for BI components
CREATE TABLE bi_runtime_log_levels (
    runtime_id VARCHAR(100) NOT NULL,
    component_name NVARCHAR(200) NOT NULL,
    log_level NVARCHAR(20) NOT NULL CHECK (log_level IN ('DEBUG', 'ERROR', 'INFO', 'WARN')),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (runtime_id, component_name),
    CONSTRAINT fk_bi_runtime_log_levels_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_component_name (component_name),
    INDEX idx_log_level (log_level)
);
GO

CREATE TRIGGER trg_bi_runtime_log_levels_updated_at
ON bi_runtime_log_levels
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE bi_runtime_log_levels
    SET updated_at = GETDATE()
    FROM bi_runtime_log_levels rll
    INNER JOIN inserted i ON rll.runtime_id = i.runtime_id 
        AND rll.component_name = i.component_name;
END;
GO

-- ============================================================================
-- MI-SPECIFIC ARTIFACT TABLES
-- ============================================================================

-- REST APIs (MI)
CREATE TABLE mi_api_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    api_name NVARCHAR (150) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    url NVARCHAR (500) NOT NULL,
    urls NVARCHAR(MAX) NULL, -- JSON array of URLs
    context NVARCHAR (500) NOT NULL,
    version NVARCHAR (50) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    tracing NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    [statistics] NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    carbon_app NVARCHAR (200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, api_name),
    CONSTRAINT fk_mi_api_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_api_name (api_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_api_artifacts_updated_at
ON mi_api_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_api_artifacts
    SET updated_at = GETDATE()
    FROM mi_api_artifacts ra
    INNER JOIN inserted i ON ra.runtime_id = i.runtime_id 
        AND ra.api_name = i.api_name;
END;
GO

-- API Resources (MI) - Resources inside an API
CREATE TABLE mi_api_resource_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    api_name NVARCHAR (150) NOT NULL,
    resource_path NVARCHAR (250) NOT NULL,
    methods NVARCHAR (20) NOT NULL, -- Single HTTP method as string (e.g., "POST", "GET")
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (
        runtime_id,
        api_name,
        resource_path
    ),
    CONSTRAINT fk_mi_api_resource_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_api (runtime_id, api_name),
    INDEX idx_methods (methods)
);
GO

CREATE TRIGGER trg_mi_api_resource_artifacts_updated_at
ON mi_api_resource_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_api_resource_artifacts
    SET updated_at = GETDATE()
    FROM mi_api_resource_artifacts rar
    INNER JOIN inserted i ON rar.runtime_id = i.runtime_id 
        AND rar.api_name = i.api_name 
        AND rar.resource_path = i.resource_path;
END;
GO

-- Proxy Services (MI)
CREATE TABLE mi_proxy_service_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    proxy_name NVARCHAR (150) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    tracing NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    [statistics] NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    carbon_app NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, proxy_name),
    CONSTRAINT fk_mi_proxy_service_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_proxy_name (proxy_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_proxy_service_artifacts_updated_at
ON mi_proxy_service_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_proxy_service_artifacts
    SET updated_at = GETDATE()
    FROM mi_proxy_service_artifacts rps
    INNER JOIN inserted i ON rps.runtime_id = i.runtime_id 
        AND rps.proxy_name = i.proxy_name;
END;
GO

-- Proxy Service Endpoints (MI)
CREATE TABLE mi_proxy_service_endpoint_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    proxy_name NVARCHAR (150) NOT NULL,
    endpoint_url NVARCHAR (250) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (
        runtime_id,
        proxy_name,
        endpoint_url
    ),
    CONSTRAINT fk_mi_proxy_service_endpoint_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_mi_proxy_service_endpoint_artifacts_runtime_id (runtime_id),
    INDEX idx_mi_proxy_service_endpoint_artifacts_proxy_name (proxy_name)
);
GO

CREATE TRIGGER trg_mi_proxy_service_endpoint_artifacts_updated_at
ON mi_proxy_service_endpoint_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_proxy_service_endpoint_artifacts
    SET updated_at = GETDATE()
    FROM mi_proxy_service_endpoint_artifacts rpse
    INNER JOIN inserted i ON rpse.runtime_id = i.runtime_id 
        AND rpse.proxy_name = i.proxy_name 
        AND rpse.endpoint_url = i.endpoint_url;
END;
GO

-- Endpoints (MI)
CREATE TABLE mi_endpoint_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    endpoint_name NVARCHAR (200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    endpoint_type NVARCHAR (100) NOT NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    tracing NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    [statistics] NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    carbon_app NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, endpoint_name),
    CONSTRAINT fk_mi_endpoint_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_endpoint_name (endpoint_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_endpoint_type (endpoint_type),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_endpoint_artifacts_updated_at
ON mi_endpoint_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_endpoint_artifacts
    SET updated_at = GETDATE()
    FROM mi_endpoint_artifacts re
    INNER JOIN inserted i ON re.runtime_id = i.runtime_id 
        AND re.endpoint_name = i.endpoint_name;
END;
GO

-- Endpoint Attributes (MI)
CREATE TABLE mi_endpoint_attribute_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    endpoint_name NVARCHAR (200) NOT NULL,
    attribute_name NVARCHAR (200) NOT NULL,
    attribute_value NVARCHAR (MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (
        runtime_id,
        endpoint_name,
        attribute_name
    ),
    CONSTRAINT fk_mi_endpoint_attribute_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_mi_endpoint_attribute_artifacts_runtime_id (runtime_id),
    INDEX idx_mi_endpoint_attribute_artifacts_endpoint_name (endpoint_name),
    INDEX idx_mi_endpoint_attribute_artifacts_attribute_name (attribute_name)
);
GO

CREATE TRIGGER trg_mi_endpoint_attribute_artifacts_updated_at
ON mi_endpoint_attribute_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_endpoint_attribute_artifacts
    SET updated_at = GETDATE()
    FROM mi_endpoint_attribute_artifacts rea
    INNER JOIN inserted i ON rea.runtime_id = i.runtime_id 
        AND rea.endpoint_name = i.endpoint_name 
        AND rea.attribute_name = i.attribute_name;
END;
GO

-- Inbound Endpoints (MI)
CREATE TABLE mi_inbound_endpoint_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    inbound_name NVARCHAR (200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    protocol NVARCHAR (50) NOT NULL,
    sequence NVARCHAR (200) NULL,
    [statistics] NVARCHAR (20) NULL,
    on_error NVARCHAR (200) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    tracing NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    carbon_app NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, inbound_name),
    CONSTRAINT fk_mi_inbound_endpoint_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_inbound_name (inbound_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_protocol (protocol),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_inbound_endpoint_artifacts_updated_at
ON mi_inbound_endpoint_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_inbound_endpoint_artifacts
    SET updated_at = GETDATE()
    FROM mi_inbound_endpoint_artifacts rie
    INNER JOIN inserted i ON rie.runtime_id = i.runtime_id 
        AND rie.inbound_name = i.inbound_name;
END;
GO

-- Sequences (MI)
CREATE TABLE mi_sequence_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    sequence_name NVARCHAR (200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    sequence_type NVARCHAR (100) NULL,
    container NVARCHAR (200) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    tracing NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    [statistics] NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    carbon_app NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, sequence_name),
    CONSTRAINT fk_mi_sequence_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_sequence_name (sequence_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_sequence_type (sequence_type),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_sequence_artifacts_updated_at
ON mi_sequence_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_sequence_artifacts
    SET updated_at = GETDATE()
    FROM mi_sequence_artifacts rs
    INNER JOIN inserted i ON rs.runtime_id = i.runtime_id 
        AND rs.sequence_name = i.sequence_name;
END;
GO

-- Tasks (MI)
CREATE TABLE mi_task_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    task_name NVARCHAR (200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    task_class NVARCHAR (500) NULL,
    task_group NVARCHAR (200) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),  
    carbon_app NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, task_name),
    CONSTRAINT fk_mi_task_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_task_name (task_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_task_artifacts_updated_at
ON mi_task_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_task_artifacts
    SET updated_at = GETDATE()
    FROM mi_task_artifacts rt
    INNER JOIN inserted i ON rt.runtime_id = i.runtime_id 
        AND rt.task_name = i.task_name;
END;
GO

-- Templates (MI)
CREATE TABLE mi_template_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    template_name NVARCHAR (200) NOT NULL,
    template_type NVARCHAR (100) NOT NULL,
    tracing NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    [statistics] NVARCHAR (20) NOT NULL DEFAULT 'disabled',
    carbon_app NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, template_name),
    CONSTRAINT fk_mi_template_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_template_name (template_name),
    INDEX idx_template_type (template_type)
);
GO

CREATE TRIGGER trg_mi_template_artifacts_updated_at
ON mi_template_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_template_artifacts
    SET updated_at = GETDATE()
    FROM mi_template_artifacts rt
    INNER JOIN inserted i ON rt.runtime_id = i.runtime_id 
        AND rt.template_name = i.template_name;
END;
GO

-- Message Stores (MI)
CREATE TABLE mi_message_store_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    store_name NVARCHAR (200) NOT NULL,
    store_type NVARCHAR (100) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    carbon_app NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, store_name),
    CONSTRAINT fk_mi_message_store_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_store_name (store_name),
    INDEX idx_store_type (store_type)
);
GO

CREATE TRIGGER trg_mi_message_store_artifacts_updated_at
ON mi_message_store_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_message_store_artifacts
    SET updated_at = GETDATE()
    FROM mi_message_store_artifacts rms
    INNER JOIN inserted i ON rms.runtime_id = i.runtime_id 
        AND rms.store_name = i.store_name;
END;
GO

-- Message Processors (MI)
CREATE TABLE mi_message_processor_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    processor_name NVARCHAR (200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    processor_type NVARCHAR (100) NOT NULL,
    processor_class NVARCHAR (500) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    carbon_app NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, processor_name),
    CONSTRAINT fk_mi_message_processor_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_processor_name (processor_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_processor_type (processor_type),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_message_processor_artifacts_updated_at
ON mi_message_processor_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_message_processor_artifacts
    SET updated_at = GETDATE()
    FROM mi_message_processor_artifacts rmp
    INNER JOIN inserted i ON rmp.runtime_id = i.runtime_id 
        AND rmp.processor_name = i.processor_name;
END;
GO

-- Local Entries (MI)
CREATE TABLE mi_local_entry_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    entry_name NVARCHAR (200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    entry_type NVARCHAR (100) NOT NULL,
    entry_value NVARCHAR (MAX) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    carbon_app NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, entry_name),
    CONSTRAINT fk_mi_local_entry_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_entry_name (entry_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_entry_type (entry_type),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_local_entry_artifacts_updated_at
ON mi_local_entry_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_local_entry_artifacts
    SET updated_at = GETDATE()
    FROM mi_local_entry_artifacts rle
    INNER JOIN inserted i ON rle.runtime_id = i.runtime_id 
        AND rle.entry_name = i.entry_name;
END;
GO

-- Data Services (MI)
CREATE TABLE mi_data_service_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    service_name NVARCHAR (200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    description NVARCHAR (MAX) NULL,
    wsdl NVARCHAR (MAX) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    carbon_app NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, service_name),
    CONSTRAINT fk_mi_data_service_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_service_name (service_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_data_service_artifacts_updated_at
ON mi_data_service_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_data_service_artifacts
    SET updated_at = GETDATE()
    FROM mi_data_service_artifacts rds
    INNER JOIN inserted i ON rds.runtime_id = i.runtime_id 
        AND rds.service_name = i.service_name;
END;
GO

-- Carbon Apps (MI)
CREATE TABLE mi_carbon_app_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    app_name NVARCHAR (200) NOT NULL,
    version NVARCHAR (50) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'Active' CHECK (state IN ('Active', 'Faulty')),
    artifacts NVARCHAR (4000) NULL, -- JSON array serialized as string
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, app_name),
    CONSTRAINT fk_mi_carbon_app_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_app_name (app_name),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_carbon_app_artifacts_updated_at
ON mi_carbon_app_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_carbon_app_artifacts
    SET updated_at = GETDATE()
    FROM mi_carbon_app_artifacts rca
    INNER JOIN inserted i ON rca.runtime_id = i.runtime_id 
        AND rca.app_name = i.app_name;
END;
GO

-- Data Sources (MI)
CREATE TABLE mi_data_source_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    datasource_name NVARCHAR (200) NOT NULL,
    datasource_type NVARCHAR (100) NULL,
    driver NVARCHAR (500) NULL,
    url NVARCHAR (1000) NULL,
    username NVARCHAR (255) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, datasource_name),
    CONSTRAINT fk_mi_data_source_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_datasource_name (datasource_name),
    INDEX idx_datasource_type (datasource_type),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_data_source_artifacts_updated_at
ON mi_data_source_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_data_source_artifacts
    SET updated_at = GETDATE()
    FROM mi_data_source_artifacts rds
    INNER JOIN inserted i ON rds.runtime_id = i.runtime_id 
        AND rds.datasource_name = i.datasource_name;
END;
GO

-- Connectors (MI)
CREATE TABLE mi_connector_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    connector_name NVARCHAR (200) NOT NULL,
    artifact_id CHAR(36) NOT NULL UNIQUE,
    package NVARCHAR (200) NOT NULL,
    version NVARCHAR (50) NULL,
    state NVARCHAR (20) NOT NULL DEFAULT 'enabled' CHECK (
        state IN (
            'enabled',
            'disabled'
        )
    ),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (
        runtime_id,
        connector_name,
        package
    ),
    CONSTRAINT fk_mi_connector_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_connector_name (connector_name),
    INDEX idx_artifact_id (artifact_id),
    INDEX idx_state (state)
);
GO

CREATE TRIGGER trg_mi_connector_artifacts_updated_at
ON mi_connector_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_connector_artifacts
    SET updated_at = GETDATE()
    FROM mi_connector_artifacts rc
    INNER JOIN inserted i ON rc.runtime_id = i.runtime_id 
        AND rc.connector_name = i.connector_name 
        AND rc.package = i.package;
END;
GO

-- Registry Resources (MI)
CREATE TABLE mi_registry_resource_artifacts (
    runtime_id VARCHAR(100) NOT NULL,
    resource_name NVARCHAR (200) NOT NULL,
    resource_type NVARCHAR (100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    PRIMARY KEY (runtime_id, resource_name),
    CONSTRAINT fk_mi_registry_resource_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_resource_name (resource_name)
);
GO

CREATE TRIGGER trg_mi_registry_resource_artifacts_updated_at
ON mi_registry_resource_artifacts
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE mi_registry_resource_artifacts
    SET updated_at = GETDATE()
    FROM mi_registry_resource_artifacts rrr
    INNER JOIN inserted i ON rrr.runtime_id = i.runtime_id 
        AND rrr.resource_name = i.resource_name;
END;
GO

-- ============================================================================
-- CONTROL COMMANDS
-- ============================================================================

CREATE TABLE mi_runtime_control_commands (
    runtime_id VARCHAR(100) NOT NULL,
    component_id CHAR(36) NOT NULL,
    artifact_name NVARCHAR(200) NOT NULL,
    artifact_type NVARCHAR(100) NOT NULL,
    action NVARCHAR (50) NOT NULL, -- enable_artifact, disable_artifact, enable_tracing, disable_tracing
    status NVARCHAR (20) NOT NULL DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'sent',
            'acknowledged',
            'completed',
            'failed',
            'timeout'
        )
    ),
    issued_at DATETIME2 (6) NOT NULL DEFAULT SYSDATETIME (),
    sent_at DATETIME2 (6) NULL,
    acknowledged_at DATETIME2 (6) NULL,
    completed_at DATETIME2 (6) NULL,
    error_message NVARCHAR (MAX) NULL,
    issued_by CHAR(36) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
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
);
GO

-- ============================================================================
-- AUDIT & EVENTS
-- ============================================================================

CREATE TABLE audit_logs (
    id BIGINT IDENTITY (1, 1) PRIMARY KEY,
    runtime_id VARCHAR(100) NULL,
    user_id CHAR(36) NULL,
    action NVARCHAR (100) NOT NULL,
    resource_type NVARCHAR (50) NULL, -- runtime, service, listener, command
    resource_id NVARCHAR (200) NULL,
    details NVARCHAR (MAX) NULL,
    client_ip NVARCHAR (45) NULL, -- IPv6 compatible
    user_agent NVARCHAR (500) NULL,
    timestamp DATETIME2 (6) NOT NULL DEFAULT SYSDATETIME (),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT fk_audit_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL,
    INDEX idx_runtime_id (runtime_id),
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_resource_type (resource_type),
    INDEX idx_timestamp (timestamp),
    INDEX idx_client_ip (client_ip)
);
GO

CREATE TABLE system_events (
    id BIGINT IDENTITY (1, 1) PRIMARY KEY,
    event_type NVARCHAR (50) NOT NULL, -- heartbeat_timeout, runtime_offline, system_error
    severity NVARCHAR (20) NOT NULL DEFAULT 'INFO' CHECK (
        severity IN (
            'INFO',
            'WARN',
            'ERROR',
            'CRITICAL'
        )
    ),
    source NVARCHAR (100) NULL, -- runtime_id or system component
    message NVARCHAR (MAX) NOT NULL,
    metadata NVARCHAR (MAX) NULL, -- JSON stored as NVARCHAR
    resolved BIT NOT NULL DEFAULT 0,
    resolved_at DATETIME2 NULL,
    resolved_by CHAR(36) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT fk_sys_events_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (user_id) ON DELETE SET NULL,
    INDEX idx_event_type (event_type),
    INDEX idx_severity (severity),
    INDEX idx_source (source),
    INDEX idx_resolved (resolved),
    INDEX idx_created_at (created_at)
);
GO

-- ============================================================================
-- MONITORING & HEALTH
-- ============================================================================

CREATE TABLE runtime_metrics (
    id BIGINT IDENTITY (1, 1) PRIMARY KEY,
    runtime_id VARCHAR(100) NOT NULL,
    metric_name NVARCHAR (100) NOT NULL,
    metric_value DECIMAL(15, 4) NOT NULL,
    metric_unit NVARCHAR (20) NULL,
    tags NVARCHAR (MAX) NULL, -- JSON stored as NVARCHAR
    timestamp DATETIME2 (6) NOT NULL DEFAULT SYSDATETIME (),
    CONSTRAINT fk_metrics_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_metric (runtime_id, metric_name),
    INDEX idx_timestamp (timestamp),
    INDEX idx_metric_name (metric_name)
);
GO

CREATE TABLE health_checks (
    id BIGINT IDENTITY (1, 1) PRIMARY KEY,
    runtime_id VARCHAR(100) NOT NULL,
    check_type NVARCHAR (50) NOT NULL, -- heartbeat, connectivity, resource
    status NVARCHAR (20) NOT NULL CHECK (
        status IN (
            'HEALTHY',
            'DEGRADED',
            'UNHEALTHY'
        )
    ),
    response_time_ms INT NULL,
    error_message NVARCHAR (MAX) NULL,
    details NVARCHAR (MAX) NULL, -- JSON stored as NVARCHAR
    timestamp DATETIME2 (6) NOT NULL DEFAULT SYSDATETIME (),
    CONSTRAINT fk_health_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE,
    INDEX idx_runtime_check (runtime_id, check_type),
    INDEX idx_status (status),
    INDEX idx_timestamp (timestamp)
);
GO

-- ============================================================================
-- SYSTEM CONFIG
-- ============================================================================

CREATE TABLE system_config (
    config_key NVARCHAR (100) NOT NULL PRIMARY KEY,
    config_value NVARCHAR (MAX) NOT NULL,
    config_type NVARCHAR (20) NOT NULL DEFAULT 'STRING' CHECK (
        config_type IN (
            'STRING',
            'INTEGER',
            'BOOLEAN',
            'JSON'
        )
    ),
    description NVARCHAR (MAX) NULL,
    is_encrypted BIT NOT NULL DEFAULT 0,
    updated_by CHAR(36) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
    CONSTRAINT fk_syscfg_updated_by FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE SET NULL,
    INDEX idx_config_type (config_type),
    INDEX idx_updated_at (updated_at)
);
GO

CREATE TRIGGER trg_system_config_updated_at
ON system_config
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE system_config
    SET updated_at = GETDATE()
    FROM system_config sc
    INNER JOIN inserted i ON sc.config_key = i.config_key;
END;
GO

-- ============================================================================
-- Reconciliation Engine Tables
-- ============================================================================

CREATE TABLE reconcile_desired_state (
    component_id CHAR(36) NOT NULL,
    env_id CHAR(36) NOT NULL,
    artifact_name NVARCHAR(200) NOT NULL,
    artifact_type NVARCHAR(100) NOT NULL,
    state_key NVARCHAR(255) NOT NULL,
    state_value NVARCHAR(1024) NULL,
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (component_id, env_id, artifact_name, artifact_type, state_key),
    INDEX idx_reconcile_desired_comp_env (component_id, env_id)
);
GO

CREATE TRIGGER trg_reconcile_desired_state_updated_at
ON reconcile_desired_state
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE reconcile_desired_state SET updated_at = GETDATE()
    FROM reconcile_desired_state t INNER JOIN inserted i
    ON t.component_id = i.component_id AND t.env_id = i.env_id
    AND t.artifact_name = i.artifact_name AND t.artifact_type = i.artifact_type
    AND t.state_key = i.state_key;
END;
GO

CREATE TABLE reconcile_observed_state (
    runtime_id VARCHAR(100) NOT NULL,
    component_id CHAR(36) NOT NULL,
    env_id CHAR(36) NOT NULL,
    artifact_name NVARCHAR(200) NOT NULL,
    artifact_type NVARCHAR(100) NOT NULL,
    state_key NVARCHAR(255) NOT NULL,
    state_value NVARCHAR(1024) NULL,
    optimistic BIT NOT NULL DEFAULT 0,
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (runtime_id, artifact_name, artifact_type, state_key),
    INDEX idx_reconcile_observed_comp_env (component_id, env_id)
);
GO

CREATE TRIGGER trg_reconcile_observed_state_updated_at
ON reconcile_observed_state
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE reconcile_observed_state SET updated_at = GETDATE()
    FROM reconcile_observed_state t INNER JOIN inserted i
    ON t.runtime_id = i.runtime_id AND t.artifact_name = i.artifact_name
    AND t.artifact_type = i.artifact_type AND t.state_key = i.state_key;
END;
GO

CREATE TABLE reconcile_backoff (
    runtime_id VARCHAR(100) NOT NULL,
    artifact_name NVARCHAR(200) NOT NULL,
    artifact_type NVARCHAR(100) NOT NULL,
    state_key NVARCHAR(255) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    has_error INT NOT NULL DEFAULT 0,
    next_attempt BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (runtime_id, artifact_name, artifact_type, state_key)
);
GO

-- ============================================================================
-- SAMPLE DATA FOR TESTING
-- ============================================================================

-- Note: Default organization and super admin user are created in RBAC V2 SEED DATA section above

-- Note: User credentials are stored in a separate H2 database (credentialsdb)
-- accessed only by the default auth backend. See resources/db/init-scripts/credentials_h2_init.sql

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
GO

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
GO

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
        0,
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
        1,
        'prod',
        '550e8400-e29b-41d4-a716-446655440000'
    );
GO

-- Insert sample refresh token for admin user (for testing)
-- Token: sample_refresh_token_for_testing (hashed with SHA256)
-- Expires in 7 days from now
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
        DATEADD (DAY, 7, GETDATE ()),
        'Mozilla/5.0 (Test Browser)',
        '127.0.0.1'
    );
GO
