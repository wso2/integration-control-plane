-- Migration: workflow feature support (Oracle 19c+)
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
-- Idempotent - safe to re-run. Fresh installs get all of this from oracle_init.sql.
-- Run once against the main ICP DB (as the ICP schema owner).

-- 1. Workflow management service base URL reported by the runtime heartbeat
--    (ORA-01430 = column being added already exists; ignored for idempotency)
DECLARE
    e_col_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_col_exists, -1430);
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE runtimes ADD (callback_url VARCHAR2(500 CHAR))';
EXCEPTION
    WHEN e_col_exists THEN NULL;
END;
/

-- 2. Allow the 'Workflow-Management' permission domain: drop every CHECK currently
--    guarding permission_domain (fresh installs name it automatically, and more than
--    one may exist), then re-add a single named constraint. The LIKE pattern requires
--    an IN (...) list, so the NOT NULL check on the same column is left alone.
BEGIN
    FOR c IN (
        SELECT constraint_name
        FROM user_constraints
        WHERE table_name = 'PERMISSIONS'
          AND constraint_type = 'C'
          AND UPPER(search_condition_vc) LIKE '%PERMISSION_DOMAIN%IN%(%'
    ) LOOP
        EXECUTE IMMEDIATE 'ALTER TABLE permissions DROP CONSTRAINT "' || c.constraint_name || '"';
    END LOOP;
END;
/

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

UPDATE permissions SET permission_domain = 'Workflow-Management' WHERE permission_name LIKE 'workflow_mgt:%';

-- 3. Workflow permissions (fixed permission_ids keep this idempotent across engines)
INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000001', 'workflow_mgt:view_human_tasks', 'Workflow-Management', 'human_task', 'view', 'View human tasks' FROM dual
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000001');

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000002', 'workflow_mgt:manage_human_tasks', 'Workflow-Management', 'human_task', 'manage', 'Complete, fail and cancel human tasks' FROM dual
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000002');

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000003', 'workflow_mgt:view_workflows', 'Workflow-Management', 'workflow', 'view', 'View workflow executions' FROM dual
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000003');

INSERT INTO permissions (permission_id, permission_name, permission_domain, resource_type, action, description)
SELECT 'a1f4c2e0-0000-4000-8000-000000000004', 'workflow_mgt:manage_workflows', 'Workflow-Management', 'workflow', 'manage', 'Start, suspend, resume, cancel and terminate workflow executions' FROM dual
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_id = 'a1f4c2e0-0000-4000-8000-000000000004');

-- 4a. Human-task permission grants
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles_v2 r, permissions p
WHERE p.permission_name IN ('workflow_mgt:view_human_tasks', 'workflow_mgt:manage_human_tasks')
    AND (r.role_name IN ('Super Admin', 'Admin', 'Developer', 'Project Admin')
         OR (r.role_name = 'Viewer' AND p.permission_name = 'workflow_mgt:view_human_tasks'))
    AND NOT EXISTS (SELECT 1 FROM role_permission_mapping m
                    WHERE m.role_id = r.role_id AND m.permission_id = p.permission_id);

-- 4b. Workflow-execution permission grants
INSERT INTO role_permission_mapping (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles_v2 r, permissions p
WHERE p.permission_name IN ('workflow_mgt:view_workflows', 'workflow_mgt:manage_workflows')
    AND (r.role_name IN ('Super Admin', 'Admin', 'Project Admin')
         OR (r.role_name = 'Developer' AND p.permission_name = 'workflow_mgt:view_workflows'))
    AND NOT EXISTS (SELECT 1 FROM role_permission_mapping m
                    WHERE m.role_id = r.role_id AND m.permission_id = p.permission_id);

COMMIT;

-- 5. Workflow metadata published in the full heartbeat
--    The BI runtime's ICP bridge sends its workflow metadata document (definitions, human
--    tasks, activities, agents — with JSON schemas) and its advertised capabilities in the
--    optional workflowMetadata/capabilities heartbeat fields. Heartbeat processing writes
--    this table unconditionally, so a missing table fails every full heartbeat transaction:
--    apply this script BEFORE upgrading the ICP server.
DECLARE
    e_object_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_object_exists, -955);
BEGIN
    EXECUTE IMMEDIATE '
        CREATE TABLE bi_workflow_metadata (
          runtime_id   CHAR(36) NOT NULL,
          metadata     CLOB NOT NULL,
          capabilities VARCHAR2(512 CHAR),
          task_queue   VARCHAR2(255 CHAR),
          created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          PRIMARY KEY (runtime_id),
          CONSTRAINT fk_bi_workflow_metadata_runtime FOREIGN KEY (runtime_id) REFERENCES runtimes (runtime_id) ON DELETE CASCADE
        )';
EXCEPTION
    WHEN e_object_exists THEN NULL;
END;
/

-- A re-run on a database that created bi_workflow_metadata before the task_queue column
-- picks the column up here; a fresh run already has it from the CREATE above.
DECLARE
    e_col_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_col_exists, -1430);
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE bi_workflow_metadata ADD (task_queue VARCHAR2(255 CHAR))';
EXCEPTION
    WHEN e_col_exists THEN NULL;
END;
/

CREATE OR REPLACE TRIGGER trg_bi_workflow_metadata_updated
BEFORE UPDATE ON bi_workflow_metadata
FOR EACH ROW
BEGIN
    :NEW.updated_at := CURRENT_TIMESTAMP;
END;
/
