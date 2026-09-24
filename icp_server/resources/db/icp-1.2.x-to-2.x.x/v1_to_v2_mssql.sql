-- ============================================================================
-- ICP v1 → v2 User Migration Script  (Microsoft SQL Server)
-- ============================================================================

-- ============================================================================
-- CONFIGURATION  — edit these values before running
-- ============================================================================

DECLARE @old_db           NVARCHAR(128) = N'userdb';     -- Old ICP v1 database
DECLARE @new_main_db      NVARCHAR(128) = N'icp_db';     -- New ICP v2 main database
DECLARE @new_creds_db     NVARCHAR(128) = N'icp_creds';  -- New credentials database
DECLARE @reset_passwords  BIT           = 0;              -- Set 1 to force a password change on first login

-- ============================================================================
-- SAFETY CHECK — verify old database is accessible
-- ============================================================================

DECLARE @check_sql  NVARCHAR(MAX);
DECLARE @old_count  INT;

SET @check_sql = N'SELECT @cnt = COUNT(*) FROM [' + @old_db + N'].[dbo].[UM_USER] WHERE UM_TENANT_ID = -1234';
EXEC sp_executesql @check_sql, N'@cnt INT OUTPUT', @cnt = @old_count OUTPUT;
PRINT 'Found ' + CAST(@old_count AS NVARCHAR) + ' user(s) in old database [' + @old_db + ']';

-- ============================================================================
-- BEGIN TRANSACTION
-- ============================================================================

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRAN;

-- ============================================================================
-- STEP 1 — Migrate user records into the new main database
-- ============================================================================

PRINT 'STEP 1: Migrating users into main database ...';

DECLARE @sql NVARCHAR(MAX);

-- 1a. Remove any pre-existing non-admin users from the new DB whose username
--     also exists in the old DB.  The old system's version of those users will
--     be inserted below, taking full priority (including UUID).
--     The admin user is handled separately (credentials-merge, not replace).

SET @sql = N'
    DELETE gum
    FROM [' + @new_main_db + N'].[dbo].[group_user_mapping] gum
    JOIN [' + @new_main_db + N'].[dbo].[users] nu ON gum.user_uuid = nu.user_id
    JOIN [' + @old_db + N'].[dbo].[UM_USER] ou ON nu.username = ou.UM_USER_NAME
    WHERE ou.UM_TENANT_ID = -1234
      AND nu.username != ''admin''
';
EXEC sp_executesql @sql;
PRINT 'Group mappings removed for replaced users: ' + CAST(@@ROWCOUNT AS NVARCHAR);

SET @sql = N'
    DELETE nc
    FROM [' + @new_creds_db + N'].[dbo].[user_credentials] nc
    JOIN [' + @old_db + N'].[dbo].[UM_USER] ou ON nc.username = ou.UM_USER_NAME
    WHERE ou.UM_TENANT_ID = -1234
      AND nc.username != ''admin''
';
EXEC sp_executesql @sql;
PRINT 'Credentials removed for replaced users: ' + CAST(@@ROWCOUNT AS NVARCHAR);

SET @sql = N'
    DELETE nu
    FROM [' + @new_main_db + N'].[dbo].[users] nu
    JOIN [' + @old_db + N'].[dbo].[UM_USER] ou ON nu.username = ou.UM_USER_NAME
    WHERE ou.UM_TENANT_ID = -1234
      AND nu.username != ''admin''
';
EXEC sp_executesql @sql;
PRINT 'Non-admin pre-existing user(s) removed from new DB: ' + CAST(@@ROWCOUNT AS NVARCHAR);

-- 1b. Insert all old users.  Only 'admin' will be skipped by NOT EXISTS
--     (because it was intentionally kept above); all others have been cleared.

SET @sql = N'
    INSERT INTO [' + @new_main_db + N'].[dbo].[users]
        (user_id, username, display_name,
         is_super_admin, is_project_author, is_oidc_user, require_password_change)
    SELECT
        u.UM_USER_ID,
        u.UM_USER_NAME,
        -- Use displayName claim when available, fall back to username
        ISNULL(
            (SELECT TOP 1 ua.UM_ATTR_VALUE
             FROM [' + @old_db + N'].[dbo].[UM_USER_ATTRIBUTE] ua
             WHERE ua.UM_USER_ID   = u.UM_ID
               AND ua.UM_TENANT_ID = u.UM_TENANT_ID
               AND ua.UM_ATTR_NAME = ''http://wso2.org/claims/displayName''),
            u.UM_USER_NAME
        ) AS display_name,
        -- is_super_admin: user has ''admin'' or ''Internal/admin'' role
        CASE WHEN
            EXISTS (
                SELECT 1
                FROM [' + @old_db + N'].[dbo].[UM_USER_ROLE] ur
                JOIN [' + @old_db + N'].[dbo].[UM_ROLE] r
                     ON r.UM_ID = ur.UM_ROLE_ID AND r.UM_TENANT_ID = ur.UM_TENANT_ID
                WHERE ur.UM_USER_ID   = u.UM_ID
                  AND ur.UM_TENANT_ID = u.UM_TENANT_ID
                  AND LOWER(r.UM_ROLE_NAME) = ''admin''
            )
            OR EXISTS (
                SELECT 1
                FROM [' + @old_db + N'].[dbo].[UM_HYBRID_USER_ROLE] hur
                JOIN [' + @old_db + N'].[dbo].[UM_HYBRID_ROLE] hr
                     ON hr.UM_ID = hur.UM_ROLE_ID AND hr.UM_TENANT_ID = hur.UM_TENANT_ID
                WHERE hur.UM_USER_NAME = u.UM_USER_NAME
                  AND hur.UM_TENANT_ID = u.UM_TENANT_ID
                  AND LOWER(hr.UM_ROLE_NAME) = ''internal/admin''
            )
        THEN 1 ELSE 0 END,
        0,    -- is_project_author
        0,    -- is_oidc_user
        ' + CAST(@reset_passwords AS NVARCHAR) + N'  -- require_password_change
    FROM [' + @old_db + N'].[dbo].[UM_USER] u
    WHERE u.UM_TENANT_ID = -1234
      AND NOT EXISTS (
          SELECT 1 FROM [' + @new_main_db + N'].[dbo].[users] nu
          WHERE nu.username = u.UM_USER_NAME
      )
';
EXEC sp_executesql @sql;
PRINT 'Users inserted: ' + CAST(@@ROWCOUNT AS NVARCHAR);

-- ============================================================================
-- STEP 2 — Migrate credentials into the new credentials database
-- ============================================================================

PRINT 'STEP 2: Migrating credentials ...';

-- 2a. Merge the seed admin specifically.
--     The init script creates user_id 550e8400-... with password ''admin''.
--     We overwrite its hash/salt with the old system''s production credentials.
--     We match on user_id (not username) to be unambiguous — any other
--     pre-existing user is left completely untouched.
SET @sql = N'
    UPDATE [' + @new_main_db + N'].[dbo].[users]
    SET    require_password_change = ' + CAST(@reset_passwords AS NVARCHAR) + N'
    WHERE  user_id = ''550e8400-e29b-41d4-a716-446655440000''
      AND  EXISTS (
               SELECT 1 FROM [' + @old_db + N'].[dbo].[UM_USER]
               WHERE UM_USER_NAME = ''admin''
                 AND UM_TENANT_ID = -1234
           )
';
EXEC sp_executesql @sql;
PRINT 'Seed admin require_password_change set: ' + CAST(@@ROWCOUNT AS NVARCHAR);

SET @sql = N'
    UPDATE nc
    SET    nc.password_hash = ou.UM_USER_PASSWORD,
           nc.password_salt = NULLIF(ou.UM_SALT_VALUE, ''''),
           nc.updated_at    = GETDATE()
    FROM   [' + @new_creds_db + N'].[dbo].[user_credentials] nc
    JOIN   [' + @old_db + N'].[dbo].[UM_USER] ou
           ON ou.UM_USER_NAME = nc.username
          AND ou.UM_TENANT_ID = -1234
    WHERE  nc.user_id = ''550e8400-e29b-41d4-a716-446655440000''
';
EXEC sp_executesql @sql;
PRINT 'Seed admin credentials merged: ' + CAST(@@ROWCOUNT AS NVARCHAR);

-- 2b. Insert credentials for all remaining users.
--     The NOT EXISTS guard skips any username already present, which after 2a
--     includes the seed admin and any other pre-existing users — both are
--     left completely untouched.
SET @sql = N'
    INSERT INTO [' + @new_creds_db + N'].[dbo].[user_credentials]
        (user_id, username, display_name, password_hash, password_salt)
    SELECT
        u.UM_USER_ID,
        u.UM_USER_NAME,
        ISNULL(
            (SELECT TOP 1 ua.UM_ATTR_VALUE
             FROM [' + @old_db + N'].[dbo].[UM_USER_ATTRIBUTE] ua
             WHERE ua.UM_USER_ID   = u.UM_ID
               AND ua.UM_TENANT_ID = u.UM_TENANT_ID
               AND ua.UM_ATTR_NAME = ''http://wso2.org/claims/displayName''),
            u.UM_USER_NAME
        ),
        u.UM_USER_PASSWORD,
        NULLIF(u.UM_SALT_VALUE, '''')
    FROM [' + @old_db + N'].[dbo].[UM_USER] u
    WHERE u.UM_TENANT_ID = -1234
      AND NOT EXISTS (
          SELECT 1 FROM [' + @new_creds_db + N'].[dbo].[user_credentials] nc
          WHERE nc.username = u.UM_USER_NAME
      )
';
EXEC sp_executesql @sql;
PRINT 'Credentials inserted: ' + CAST(@@ROWCOUNT AS NVARCHAR);

-- ============================================================================
-- STEP 3 — Assign users to ICP v2 groups
-- ============================================================================
--
-- Mapping: admin / Internal/admin -> Super Admins
--          every other user       -> Developers

PRINT 'STEP 3: Assigning group memberships ...';

-- 3a. Users with "admin" or "Internal/admin" role -> Super Admins

SET @sql = N'
    INSERT INTO [' + @new_main_db + N'].[dbo].[group_user_mapping] (group_id, user_uuid)
    SELECT
        (SELECT TOP 1 group_id FROM [' + @new_main_db + N'].[dbo].[user_groups]
         WHERE group_name = ''Super Admins'' AND org_uuid = 1),
        nu.user_id
    FROM [' + @old_db + N'].[dbo].[UM_USER] u
    JOIN [' + @new_main_db + N'].[dbo].[users] nu ON nu.username = u.UM_USER_NAME
    WHERE u.UM_TENANT_ID = -1234
      AND (
          EXISTS (
              SELECT 1
              FROM [' + @old_db + N'].[dbo].[UM_USER_ROLE] ur
              JOIN [' + @old_db + N'].[dbo].[UM_ROLE] r
                   ON r.UM_ID = ur.UM_ROLE_ID AND r.UM_TENANT_ID = ur.UM_TENANT_ID
              WHERE ur.UM_USER_ID   = u.UM_ID
                AND ur.UM_TENANT_ID = u.UM_TENANT_ID
                AND LOWER(r.UM_ROLE_NAME) = ''admin''
          )
          OR EXISTS (
              SELECT 1
              FROM [' + @old_db + N'].[dbo].[UM_HYBRID_USER_ROLE] hur
              JOIN [' + @old_db + N'].[dbo].[UM_HYBRID_ROLE] hr
                   ON hr.UM_ID = hur.UM_ROLE_ID AND hr.UM_TENANT_ID = hur.UM_TENANT_ID
              WHERE hur.UM_USER_NAME = u.UM_USER_NAME
                AND hur.UM_TENANT_ID = u.UM_TENANT_ID
                AND LOWER(hr.UM_ROLE_NAME) = ''internal/admin''
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM [' + @new_main_db + N'].[dbo].[group_user_mapping] gum
          WHERE  gum.user_uuid = nu.user_id
      )
';
EXEC sp_executesql @sql;
PRINT 'Assigned to Super Admins: ' + CAST(@@ROWCOUNT AS NVARCHAR);

-- 3b. All remaining users (any other role or no role) -> Developers

SET @sql = N'
    INSERT INTO [' + @new_main_db + N'].[dbo].[group_user_mapping] (group_id, user_uuid)
    SELECT
        (SELECT TOP 1 group_id FROM [' + @new_main_db + N'].[dbo].[user_groups]
         WHERE group_name = ''Developers'' AND org_uuid = 1),
        nu.user_id
    FROM [' + @old_db + N'].[dbo].[UM_USER] u
    JOIN [' + @new_main_db + N'].[dbo].[users] nu ON nu.username = u.UM_USER_NAME
    WHERE u.UM_TENANT_ID = -1234
      AND NOT EXISTS (
          SELECT 1 FROM [' + @new_main_db + N'].[dbo].[group_user_mapping] gum
          WHERE  gum.user_uuid = nu.user_id
      )
';
EXEC sp_executesql @sql;
PRINT 'Assigned to Developers: ' + CAST(@@ROWCOUNT AS NVARCHAR);

-- ============================================================================
-- STEP 3c — Create org_secrets table and add key_id column to runtimes
-- ============================================================================

PRINT 'STEP 3c: Creating org_secrets table ...';

SET @sql = N'
    CREATE TABLE [' + @new_main_db + N'].[dbo].[org_secrets] (
        key_id          VARCHAR(16)   NOT NULL,
        environment_id  CHAR(36)      NOT NULL,
        key_material    NVARCHAR(256) NOT NULL,
        project_id      CHAR(36)      NULL,
        component_id    CHAR(36)      NULL,
        project_handler NVARCHAR(255) NULL,
        component_name  NVARCHAR(255) NULL,
        runtime_type    NVARCHAR(8)   NULL CHECK (runtime_type IN (''MI'', ''BI'')),
        bound_at        DATETIME2     NULL,
        created_at      DATETIME2     NOT NULL DEFAULT GETDATE(),
        created_by      CHAR(36)      NULL,
        PRIMARY KEY (key_id),
        CONSTRAINT fk_org_secrets_project     FOREIGN KEY (project_id)     REFERENCES [' + @new_main_db + N'].[dbo].[projects]      (project_id)      ON DELETE CASCADE,
        -- CASCADE/SET NULL blocked: MSSQL multiple-cascade-path. App layer handles cleanup.
        CONSTRAINT fk_org_secrets_component   FOREIGN KEY (component_id)   REFERENCES [' + @new_main_db + N'].[dbo].[components]    (component_id)    ON DELETE NO ACTION,
        CONSTRAINT fk_org_secrets_environment FOREIGN KEY (environment_id) REFERENCES [' + @new_main_db + N'].[dbo].[environments]  (environment_id)  ON DELETE CASCADE,
        CONSTRAINT fk_org_secrets_created_by  FOREIGN KEY (created_by)     REFERENCES [' + @new_main_db + N'].[dbo].[users]          (user_id)         ON DELETE SET NULL
    );
    CREATE INDEX idx_org_secrets_environment ON [' + @new_main_db + N'].[dbo].[org_secrets] (environment_id);
    ALTER TABLE [' + @new_main_db + N'].[dbo].[runtimes] ADD key_id VARCHAR(16) NULL;
    -- SET NULL blocked: MSSQL multiple-cascade-path. App layer handles cleanup.
    ALTER TABLE [' + @new_main_db + N'].[dbo].[runtimes]
        ADD CONSTRAINT fk_runtime_key_id FOREIGN KEY (key_id)
            REFERENCES [' + @new_main_db + N'].[dbo].[org_secrets] (key_id) ON DELETE NO ACTION;
';
EXEC sp_executesql @sql;
PRINT 'org_secrets table and runtimes.key_id created.';

SET @sql = N'
    IF OBJECT_ID(N''[' + @new_main_db + N'].[dbo].[mi_composite_app_artifacts]'', N''U'') IS NULL
    BEGIN
        CREATE TABLE [' + @new_main_db + N'].[dbo].[mi_composite_app_artifacts] (
            runtime_id CHAR(36) NOT NULL,
            app_name NVARCHAR(200) NOT NULL,
            version NVARCHAR(50) NOT NULL DEFAULT ''__UNVERSIONED__'',
            state NVARCHAR(20) NOT NULL DEFAULT ''Active'' CHECK (state IN (''Active'', ''Faulty'')),
            error_message NVARCHAR(MAX) NULL,
            artifacts NVARCHAR(4000) NULL,
            created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
            updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
            PRIMARY KEY (runtime_id, app_name, version),
            CONSTRAINT fk_mi_composite_app_artifacts_runtime FOREIGN KEY (runtime_id) REFERENCES [' + @new_main_db + N'].[dbo].[runtimes] (runtime_id) ON DELETE CASCADE
        );

        CREATE INDEX idx_runtime_id ON [' + @new_main_db + N'].[dbo].[mi_composite_app_artifacts] (runtime_id);
        CREATE INDEX idx_app_name ON [' + @new_main_db + N'].[dbo].[mi_composite_app_artifacts] (app_name);
        CREATE INDEX idx_state ON [' + @new_main_db + N'].[dbo].[mi_composite_app_artifacts] (state);

        EXEC (N''
            CREATE TRIGGER trg_mi_composite_app_artifacts_updated_at
            ON [' + @new_main_db + N'].[dbo].[mi_composite_app_artifacts]
            AFTER UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                UPDATE [' + @new_main_db + N'].[dbo].[mi_composite_app_artifacts]
                SET updated_at = GETDATE()
                FROM [' + @new_main_db + N'].[dbo].[mi_composite_app_artifacts] rca
                INNER JOIN inserted i ON rca.runtime_id = i.runtime_id
                    AND rca.app_name = i.app_name
                    AND rca.version = i.version;
            END;
        '');
    END
';
EXEC sp_executesql @sql;
PRINT 'mi_composite_app_artifacts table ensured.';

-- ============================================================================
-- STEP 4 — Summary report
-- ============================================================================

PRINT 'STEP 4: Summary';

SET @sql = N'
    SELECT
        COUNT(*)                              AS total_migrated,
        SUM(CAST(is_super_admin AS INT))      AS super_admins,
        SUM(CAST(require_password_change AS INT)) AS pending_password_change
    FROM [' + @new_main_db + N'].[dbo].[users]
    WHERE username IN (
        SELECT UM_USER_NAME FROM [' + @old_db + N'].[dbo].[UM_USER]
        WHERE UM_TENANT_ID = -1234
    )
';
EXEC sp_executesql @sql;

    -- ============================================================================
    -- COMMIT
    -- ============================================================================

    COMMIT TRAN;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRAN;
    THROW;
END CATCH;

-- ============================================================================
-- DONE
-- ============================================================================

PRINT '================================================================';
PRINT 'Migration complete.';
PRINT 'POST-MIGRATION: set passwordHashingAlgorithm = "<old_algorithm>"';
PRINT 'in Config.toml so migrated users can log in and reset passwords.';
PRINT '================================================================';
