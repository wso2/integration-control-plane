-- ============================================================================
-- ICP v1 → v2 User Migration Script  (MySQL / MariaDB)
-- ============================================================================

-- ============================================================================
-- CONFIGURATION  — edit these values before running
-- ============================================================================

SET @old_db           = 'userdb';     -- Old ICP v1 database name
SET @new_main_db      = 'icp_db';     -- New ICP v2 main database name
SET @new_creds_db     = 'icp_creds';  -- New ICP v2 credentials database name
SET @reset_passwords  = FALSE;        -- Set TRUE to force all migrated users to change password on first login

-- ============================================================================
-- SAFETY CHECKS
-- ============================================================================

SELECT 'Starting ICP v1 → v2 user migration' AS status;

-- Verify the old database is accessible
SET @check_sql = CONCAT(
    'SELECT COUNT(*) INTO @old_user_count FROM `',
    @old_db, '`.UM_USER WHERE UM_TENANT_ID = -1234');
PREPARE chk FROM @check_sql;
EXECUTE chk;
DEALLOCATE PREPARE chk;
SELECT CONCAT('Found ', @old_user_count, ' user(s) in old database') AS status;

-- ============================================================================
-- BEGIN TRANSACTION
-- Everything below is atomic. The mysql client stops at the first error and
-- closes the session, which rolls back any partial changes, so the script can
-- simply be re-run after fixing the cause.
--
-- The old user store usually has a different collation from the ICP v2 tables
-- (utf8mb4_unicode_ci), e.g. utf8mb4_0900_ai_ci when it was created with the
-- MySQL 8 server default. Every comparison against an old-database column
-- therefore converts it with
--     CONVERT(<col> USING utf8mb4) COLLATE utf8mb4_unicode_ci
-- ============================================================================

SET autocommit = 0;
START TRANSACTION;

-- ============================================================================
-- STEP 1 — Migrate user records into the new main database
-- ============================================================================

SELECT 'STEP 1: Migrating users into main database ...' AS status;

-- 1a. Remove any pre-existing non-admin users from the new DB whose username
--     also exists in the old DB.  The old system's version of those users will
--     be inserted below, taking full priority (including UUID).
--     The admin user is handled separately (credentials-merge, not replace).
--     Their group_user_mapping rows go with them (ON DELETE CASCADE).

SET @sql = CONCAT('
    DELETE FROM `', @new_creds_db, '`.user_credentials
    WHERE username != ''admin''
      AND username IN (
          SELECT CONVERT(ou.UM_USER_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci
          FROM `', @old_db, '`.UM_USER ou
          WHERE ou.UM_TENANT_ID = -1234
      )
');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = CONCAT('
    DELETE FROM `', @new_main_db, '`.users
    WHERE username != ''admin''
      AND username IN (
          SELECT CONVERT(ou.UM_USER_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci
          FROM `', @old_db, '`.UM_USER ou
          WHERE ou.UM_TENANT_ID = -1234
      )
');
PREPARE stmt FROM @sql;
EXECUTE stmt;
SET @removed = ROW_COUNT();
DEALLOCATE PREPARE stmt;

SELECT CONCAT(@removed, ' non-admin pre-existing user(s) removed from new DB') AS status;

-- 1b. Insert all old users.  Only 'admin' can already exist here (it was
--     intentionally kept above, and exists only if someone has signed in to
--     the new ICP as admin), in which case INSERT IGNORE skips it.
--     The seed admin's user_id lives in the credentials DB, and ICP v2 looks up
--     the users row by that id at login, so a user whose username already has
--     credentials (only the seed admin, after 1a) keeps that credentials id
--     instead of the old UM_USER_ID.

SET @sql = CONCAT('
    INSERT IGNORE INTO `', @new_main_db, '`.users
        (user_id, username, display_name,
         is_super_admin, is_project_author, is_oidc_user, require_password_change)
    SELECT
        COALESCE(
            (SELECT nc.user_id
             FROM `', @new_creds_db, '`.user_credentials nc
             WHERE nc.username = CONVERT(u.UM_USER_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci),
            u.UM_USER_ID
        ) AS user_id,
        u.UM_USER_NAME,
        -- Use displayName claim when available, fall back to username
        COALESCE(
            (SELECT ua.UM_ATTR_VALUE
             FROM `', @old_db, '`.UM_USER_ATTRIBUTE ua
             WHERE ua.UM_USER_ID   = u.UM_ID
               AND ua.UM_TENANT_ID = u.UM_TENANT_ID
               AND ua.UM_ATTR_NAME = ''http://wso2.org/claims/displayName''
             LIMIT 1),
            u.UM_USER_NAME
        ) AS display_name,
        -- Mark as super admin if user has ''admin'' or ''Internal/admin'' role
        CASE WHEN EXISTS (
            SELECT 1
            FROM `', @old_db, '`.UM_USER_ROLE ur
            JOIN `', @old_db, '`.UM_ROLE r
                 ON r.UM_ID = ur.UM_ROLE_ID AND r.UM_TENANT_ID = ur.UM_TENANT_ID
            WHERE ur.UM_USER_ID   = u.UM_ID
              AND ur.UM_TENANT_ID = u.UM_TENANT_ID
              AND LOWER(r.UM_ROLE_NAME) IN (''admin'')
        ) OR EXISTS (
            SELECT 1
            FROM `', @old_db, '`.UM_HYBRID_USER_ROLE hur
            JOIN `', @old_db, '`.UM_HYBRID_ROLE hr
                 ON hr.UM_ID = hur.UM_ROLE_ID AND hr.UM_TENANT_ID = hur.UM_TENANT_ID
            WHERE hur.UM_USER_NAME = u.UM_USER_NAME
              AND hur.UM_TENANT_ID = u.UM_TENANT_ID
              AND LOWER(hr.UM_ROLE_NAME) IN (''internal/admin'')
        ) THEN TRUE ELSE FALSE END AS is_super_admin,
        FALSE,   -- is_project_author
        FALSE,   -- is_oidc_user
        ', @reset_passwords, '  -- require_password_change
    FROM `', @old_db, '`.UM_USER u
    WHERE u.UM_TENANT_ID = -1234
');
PREPARE stmt FROM @sql;
EXECUTE stmt;
SET @n = ROW_COUNT();
DEALLOCATE PREPARE stmt;

SELECT CONCAT(@n, ' user row(s) inserted into main database') AS status;

-- ============================================================================
-- STEP 2 — Migrate credentials into the new credentials database
-- ============================================================================

SELECT 'STEP 2: Migrating credentials ...' AS status;

-- 2a. Merge the seed admin specifically.
--     The init script creates user_id 550e8400-... with password 'admin'.
--     We overwrite its hash/salt with the old system's production credentials.
--     We match on user_id (not username) to be unambiguous — any other
--     pre-existing user is left completely untouched.
SET @seed_admin_id = '550e8400-e29b-41d4-a716-446655440000';

SET @sql = CONCAT('
    UPDATE `', @new_main_db, '`.users
    SET    require_password_change = ', @reset_passwords, '
    WHERE  user_id = ''550e8400-e29b-41d4-a716-446655440000''
      AND  EXISTS (
               SELECT 1 FROM `', @old_db, '`.UM_USER
               WHERE UM_USER_NAME = ''admin'' AND UM_TENANT_ID = -1234
           )
');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = CONCAT('
    UPDATE `', @new_creds_db, '`.user_credentials nc
    JOIN   `', @old_db, '`.UM_USER ou
           ON nc.username = CONVERT(ou.UM_USER_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci
          AND ou.UM_TENANT_ID = -1234
    SET    nc.password_hash = ou.UM_USER_PASSWORD,
           nc.password_salt = NULLIF(ou.UM_SALT_VALUE, ''''),
           nc.updated_at    = CURRENT_TIMESTAMP
    WHERE  nc.user_id = ''550e8400-e29b-41d4-a716-446655440000''
');
PREPARE stmt FROM @sql;
EXECUTE stmt;
SET @n = ROW_COUNT();
DEALLOCATE PREPARE stmt;

SELECT CONCAT(@n, ' seed admin credential(s) merged') AS status;

-- 2b. Insert credentials for all remaining users.
--     INSERT IGNORE skips any username that already exists (which after 2a
--     includes the seed admin and any other pre-existing users — both are
--     left untouched).
SET @sql = CONCAT('
    INSERT IGNORE INTO `', @new_creds_db, '`.user_credentials
        (user_id, username, display_name, password_hash, password_salt)
    SELECT
        u.UM_USER_ID,
        u.UM_USER_NAME,
        COALESCE(
            (SELECT ua.UM_ATTR_VALUE
             FROM `', @old_db, '`.UM_USER_ATTRIBUTE ua
             WHERE ua.UM_USER_ID   = u.UM_ID
               AND ua.UM_TENANT_ID = u.UM_TENANT_ID
               AND ua.UM_ATTR_NAME = ''http://wso2.org/claims/displayName''
             LIMIT 1),
            u.UM_USER_NAME
        ),
        u.UM_USER_PASSWORD,
        NULLIF(u.UM_SALT_VALUE, '''')
    FROM `', @old_db, '`.UM_USER u
    WHERE u.UM_TENANT_ID = -1234
');
PREPARE stmt FROM @sql;
EXECUTE stmt;
SET @n = ROW_COUNT();
DEALLOCATE PREPARE stmt;

SELECT CONCAT(@n, ' credential row(s) inserted') AS status;

-- ============================================================================
-- STEP 3 — Assign users to ICP v2 groups
-- ============================================================================
--
-- Mapping: admin / Internal/admin -> Super Admins
--          every other user       -> Developers

SELECT 'STEP 3: Assigning group memberships ...' AS status;

-- 3a. Users with "admin" or "Internal/admin" role -> Super Admins

SET @sql = CONCAT('
    INSERT IGNORE INTO `', @new_main_db, '`.group_user_mapping (group_id, user_uuid)
    SELECT
        (SELECT group_id FROM `', @new_main_db, '`.user_groups
         WHERE group_name = ''Super Admins'' AND org_uuid = 1 LIMIT 1),
        nu.user_id
    FROM `', @old_db, '`.UM_USER u
    JOIN `', @new_main_db, '`.users nu
         ON nu.username = CONVERT(u.UM_USER_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci
    WHERE u.UM_TENANT_ID = -1234
      AND (
          EXISTS (
              SELECT 1
              FROM `', @old_db, '`.UM_USER_ROLE ur
              JOIN `', @old_db, '`.UM_ROLE r
                   ON r.UM_ID = ur.UM_ROLE_ID AND r.UM_TENANT_ID = ur.UM_TENANT_ID
              WHERE ur.UM_USER_ID   = u.UM_ID
                AND ur.UM_TENANT_ID = u.UM_TENANT_ID
                AND LOWER(r.UM_ROLE_NAME) = ''admin''
          )
          OR EXISTS (
              SELECT 1
              FROM `', @old_db, '`.UM_HYBRID_USER_ROLE hur
              JOIN `', @old_db, '`.UM_HYBRID_ROLE hr
                   ON hr.UM_ID = hur.UM_ROLE_ID AND hr.UM_TENANT_ID = hur.UM_TENANT_ID
              WHERE hur.UM_USER_NAME = u.UM_USER_NAME
                AND hur.UM_TENANT_ID = u.UM_TENANT_ID
                AND LOWER(hr.UM_ROLE_NAME) = ''internal/admin''
          )
      )
');
PREPARE stmt FROM @sql;
EXECUTE stmt;
SET @n = ROW_COUNT();
DEALLOCATE PREPARE stmt;
SELECT CONCAT(@n, ' user(s) assigned to Super Admins') AS status;

-- 3b. All remaining users (any other role or no role) -> Developers

SET @sql = CONCAT('
    INSERT IGNORE INTO `', @new_main_db, '`.group_user_mapping (group_id, user_uuid)
    SELECT
        (SELECT group_id FROM `', @new_main_db, '`.user_groups
         WHERE group_name = ''Developers'' AND org_uuid = 1 LIMIT 1),
        nu.user_id
    FROM `', @old_db, '`.UM_USER u
    JOIN `', @new_main_db, '`.users nu
         ON nu.username = CONVERT(u.UM_USER_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci
    WHERE u.UM_TENANT_ID = -1234
      AND NOT EXISTS (
          SELECT 1
          FROM `', @new_main_db, '`.group_user_mapping gum
          WHERE gum.user_uuid = nu.user_id
      )
');
PREPARE stmt FROM @sql;
EXECUTE stmt;
SET @n = ROW_COUNT();
DEALLOCATE PREPARE stmt;
SELECT CONCAT(@n, ' user(s) assigned to Developers') AS status;

-- ============================================================================
-- STEP 4 — Summary report
-- ============================================================================

SELECT 'STEP 4: Migration summary' AS status;

SET @sql = CONCAT('
    SELECT
        COUNT(*)                                      AS total_users_in_old_db,
        SUM(is_super_admin)                           AS super_admins,
        (SELECT COUNT(*) FROM `', @new_main_db, '`.group_user_mapping gum
         JOIN `', @new_main_db, '`.user_groups ug ON gum.group_id = ug.group_id
         WHERE ug.group_name = ''Super Admins'')       AS in_super_admins_group,
        (SELECT COUNT(*) FROM `', @new_main_db, '`.group_user_mapping gum
         JOIN `', @new_main_db, '`.user_groups ug ON gum.group_id = ug.group_id
         WHERE ug.group_name = ''Developers'')         AS in_developers_group,
        SUM(require_password_change)                  AS require_password_change
    FROM `', @new_main_db, '`.users
    WHERE username IN (
        SELECT CONVERT(UM_USER_NAME USING utf8mb4) COLLATE utf8mb4_unicode_ci
        FROM `', @old_db, '`.UM_USER WHERE UM_TENANT_ID = -1234
    )
');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- COMMIT
-- ============================================================================

COMMIT;
SET autocommit = 1;

-- ============================================================================
-- DONE
-- ============================================================================

SELECT '================================================================' AS status;
SELECT 'Migration complete.' AS status;
SELECT 'POST-MIGRATION ACTION REQUIRED:' AS status;
SELECT CONCAT(
    'Set  passwordHashingAlgorithm = "<old_algorithm>"  at the top level of ',
    '<ICP_HOME>/conf/deployment.toml before starting ICP, so that migrated users can log in.'
) AS status;
SELECT '================================================================' AS status;
