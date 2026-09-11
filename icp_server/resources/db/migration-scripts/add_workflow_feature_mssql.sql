-- Migration: workflow feature support (Microsoft SQL Server)
-- Adds everything an existing pre-workflow deployment needs for the workflow feature:
--   1. runtimes.callback_url        - retained for schema compatibility: heartbeat writes still
--                                     reference the column, but nothing populates it now that
--                                     management goes through the command tunnel
--   2. 'Workflow-Management' domain - widens the permission_domain CHECK constraint
--                                     (inline auto-named constraint: looked up dynamically)
--   3. workflow_mgt:* permissions   - human-task and workflow-execution permissions
--   4. role grants                  - Super Admin/Admin/Project Admin: view + manage both;
--                                     Developer: manage human tasks, view workflows;
--                                     Viewer: view human tasks only
--   5. bi_workflow_metadata     - workflow metadata, capabilities and task_queue from the full heartbeat
-- Idempotent - safe to re-run. Fresh installs get all of this from mssql_init.sql.
-- Run once against the main ICP DB.

-- 1. Workflow management service base URL reported by the runtime heartbeat
IF COL_LENGTH('runtimes', 'callback_url') IS NULL
    ALTER TABLE runtimes ADD callback_url NVARCHAR(500) NULL;
GO

-- 2. Allow the 'Workflow-Management' permission domain: drop every CHECK currently
--    guarding permission_domain (fresh installs name it automatically, and more than
--    one may exist), then re-add a single named constraint.
DECLARE @cn NVARCHAR(256);
SELECT @cn = MIN(name) FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('permissions') AND definition LIKE '%permission_domain%';
WHILE @cn IS NOT NULL
BEGIN
    EXEC('ALTER TABLE permissions DROP CONSTRAINT [' + @cn + ']');
    SELECT @cn = MIN(name) FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID('permissions') AND definition LIKE '%permission_domain%';
END
GO

ALTER TABLE permissions ADD CONSTRAINT chk_permission_domain CHECK (
    permission_domain IN (
        'Integration-Management',
        'Environment-Management',
        'Observability-Management',
        'Project-Management',
        'User-Management',
        'Workflow-Management'
    )
);
GO

UPDATE permissions SET permission_domain = 'Workflow-Management' WHERE permission_name LIKE 'workflow_mgt:%';
GO

-- 3. Workflow permissions (fixed permission_ids keep this idempotent across engines)
INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000001', 'workflow_mgt:view_human_tasks', 'Workflow-Management', 'human_task', 'view', 'View human tasks'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000001');

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000002', 'workflow_mgt:manage_human_tasks', 'Workflow-Management', 'human_task', 'manage', 'Complete, fail and cancel human tasks'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000002');

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000003', 'workflow_mgt:view_workflows', 'Workflow-Management', 'workflow', 'view', 'View workflow executions'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000003');

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000004', 'workflow_mgt:manage_workflows', 'Workflow-Management', 'workflow', 'manage', 'Start, suspend, resume, cancel and terminate workflow executions'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000004');
GO

-- 4a. Human-task permission grants
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles_v2 r, permissions p
WHERE p.permission_name IN ('workflow_mgt:view_human_tasks', 'workflow_mgt:manage_human_tasks')
    AND (r.role_name IN ('Super Admin', 'Admin', 'Developer', 'Project Admin')
         OR (r.role_name = 'Viewer' AND p.permission_name = 'workflow_mgt:view_human_tasks'))
    AND NOT EXISTS (SELECT 1 FROM role_permission_mapping m
                    WHERE m.role_id = r.role_id AND m.permission_id = p.permission_id);
GO

-- 4b. Workflow-execution permission grants
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles_v2 r, permissions p
WHERE p.permission_name IN ('workflow_mgt:view_workflows', 'workflow_mgt:manage_workflows')
    AND (r.role_name IN ('Super Admin', 'Admin', 'Project Admin')
         OR (r.role_name = 'Developer' AND p.permission_name = 'workflow_mgt:view_workflows'))
    AND NOT EXISTS (SELECT 1 FROM role_permission_mapping m
                    WHERE m.role_id = r.role_id AND m.permission_id = p.permission_id);
GO

-- 5. Workflow metadata published in the full heartbeat
--    The BI runtime's ICP bridge sends its workflow metadata document (definitions, human
--    tasks, activities, agents — with JSON schemas) and its advertised capabilities in the
--    optional workflowMetadata/capabilities heartbeat fields. Heartbeat processing writes
--    this table unconditionally, so a missing table fails every full heartbeat transaction:
--    apply this script BEFORE upgrading the ICP server.
IF OBJECT_ID('bi_workflow_metadata', 'U') IS NULL
BEGIN
    CREATE TABLE bi_workflow_metadata (
        runtime_id CHAR(36) NOT NULL,
        metadata NVARCHAR (MAX) NOT NULL,
        capabilities NVARCHAR (512),
        task_queue NVARCHAR (255),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE (),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE (),
        PRIMARY KEY (runtime_id),
        CONSTRAINT fk_bi_workflow_metadata_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
    );
END
GO

-- A re-run on a database that created bi_workflow_metadata before the task_queue column
-- picks the column up here; a fresh run already has it from the CREATE above.
IF COL_LENGTH('bi_workflow_metadata', 'task_queue') IS NULL
    ALTER TABLE bi_workflow_metadata ADD task_queue NVARCHAR (255) NULL;
GO


DROP TRIGGER IF EXISTS trg_bi_workflow_metadata_updated_at;
GO

CREATE TRIGGER trg_bi_workflow_metadata_updated_at
ON bi_workflow_metadata
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE bi_workflow_metadata
    SET updated_at = GETDATE()
    FROM bi_workflow_metadata t
    INNER JOIN inserted i ON t.runtime_id = i.runtime_id;
END;
GO
