# ICP v1 → v2 Migration

This directory contains SQL scripts for migrating an ICP database from **ICP v1** to **ICP v2**.

## Platform coverage

| Platform | Script | Covers |
|---|---|---|
| MySQL / MariaDB | `v1_to_v2_mysql.sql` | User/credential/group migration **+** schema changes (org_secrets, runtimes.key_id, mi_composite_app_artifacts) |
| Microsoft SQL Server | `v1_to_v2_mssql.sql` | User/credential/group migration **+** schema changes |
| PostgreSQL | `v1_to_v2_postgres.sql` | **Schema changes only** (see note below) |
| H2 | `v1_to_v2_h2.sql` | **Schema changes only** (see note below) |

### Why PostgreSQL and H2 only cover schema changes

The MySQL/MSSQL scripts migrate user accounts, credentials, and role
assignments by querying across three separate databases (old `userdb`, new
main DB, new credentials DB) in a single session, using same-server
cross-database table references (e.g. `` `dbname`.`table` `` in MySQL,
`[dbname].[dbo].[table]` in MSSQL).

PostgreSQL does not support this style of cross-database querying without
the `postgres_fdw` or `dblink` extension, and H2 is typically run as a
single embedded database per deployment. Rather than port the user-migration
DML without a way to verify it against a real cross-database setup,
`v1_to_v2_postgres.sql` and `v1_to_v2_h2.sql` currently cover only the
schema/DDL portion — bringing an existing v2 database up to date with the
`mi_composite_app_artifacts` table, the `org_secrets` table, and the
`runtimes.key_id` column introduced after the initial v2 release.

User/credential/group migration for PostgreSQL and H2 is tracked as a
separate follow-up.

---

The MySQL/MSSQL scripts require the old and new databases to be on the same server instance, using cross-database references to read from the old schema and write to both new schemas in a single session.

Scripts are provided for **MySQL / MariaDB** and **Microsoft SQL Server**. The script requires the old and new databases to be on the same server instance, using cross-database references to read from the old schema and write to both new schemas in a single session.

---

## Running the script

**Prerequisites (MySQL/MSSQL user migration):**

1. The new ICP v2 main DB and credentials DB must already be initialised using the standard init scripts.
2. The database user running the script must have `SELECT` privileges on the old database and `INSERT` / `UPDATE` / `DELETE` privileges on the two new databases.

(PostgreSQL and H2 have their own, simpler prerequisites — see their sections below.)

---

### MySQL / MariaDB (`v1_to_v2_mysql.sql`)

1. Edit the configuration variables at the top of `v1_to_v2_mysql.sql`:

   ```sql
   SET @old_db          = 'userdb';    -- Old ICP v1 database name
   SET @new_main_db     = 'icp_db';    -- New ICP v2 main database name
   SET @new_creds_db    = 'icp_creds'; -- New ICP v2 credentials database name
   SET @reset_passwords = FALSE;       -- Set TRUE to force a password change on first login
   ```

2. Run the script:

   ```bash
   mysql -u <admin_user> -p < v1_to_v2_mysql.sql 2>&1 | tee migration.log
   ```

---

### Microsoft SQL Server (`v1_to_v2_mssql.sql`)

1. Edit the configuration variables at the top of `v1_to_v2_mssql.sql`:

   ```sql
   DECLARE @old_db          NVARCHAR(128) = N'userdb';    -- Old ICP v1 database name
   DECLARE @new_main_db     NVARCHAR(128) = N'icp_db';    -- New ICP v2 main database name
   DECLARE @new_creds_db    NVARCHAR(128) = N'icp_creds'; -- New ICP v2 credentials database name
   DECLARE @reset_passwords BIT           = 0;             -- Set 1 to force a password change on first login
   ```

2. Run the script:

   ```bash
   sqlcmd -S <server> -U <user> -P <password> -i v1_to_v2_mssql.sql
   ```

   Alternatively, open the file in SSMS and execute it.

The script prints a status message after each step and a summary table at the end.

---

### PostgreSQL (`v1_to_v2_postgres.sql`)

This script only applies schema changes (see "Platform coverage" above) — there is no configuration to edit.

1. Run the script against the existing ICP v2 main database:

```bash
   psql -U <admin_user> -d icp_db -f v1_to_v2_postgres.sql
```

The script is safe to re-run: table, index, and trigger creation are all guarded with existence checks.

---

### H2 (`v1_to_v2_h2.sql`)

This script only applies schema changes (see "Platform coverage" above) — there is no configuration to edit.

1. Run the script against the existing ICP v2 H2 database:

```bash
   java -cp h2*.jar org.h2.tools.RunScript -url jdbc:h2:./icp_db -user sa -script v1_to_v2_h2.sql
```

   Alternatively, paste the script into the H2 Console and execute it.

Most statements are guarded with `IF NOT EXISTS`. The one exception is the `runtimes.key_id` foreign key constraint (H2 does not support conditional constraint creation) — run this script only once per database.

---

## Post-migration checklist

1. **`Config.toml`** — set `passwordHashingAlgorithm` to match the old `PasswordDigest`:

   ```toml
   passwordHashingAlgorithm = "sha-256"   # or sha-1, md5, sha-512, plain_text
   ```

2. **Restart** the ICP v2 server.

---

## MySQL/MSSQL user migration details

The remaining sections below (What is migrated, Conflict resolution, Password migration, Role → group mapping) describe the user/credential/group migration performed by `v1_to_v2_mysql.sql` and `v1_to_v2_mssql.sql` only. They do not apply to `v1_to_v2_postgres.sql` or `v1_to_v2_h2.sql`, which cover schema changes only (see "Platform coverage" above).

## What is migrated

| Data | Source (ICP v1) | Destination (ICP v2) |
|---|---|---|
| User identity | `UM_USER` (`UM_USER_ID`, `UM_USER_NAME`) | `users` (main DB) |
| Display name | `UM_USER_ATTRIBUTE` (`displayName` claim) | `users.display_name` |
| Password hash + salt | `UM_USER` (`UM_USER_PASSWORD`, `UM_SALT_VALUE`) | `user_credentials` (credentials DB) |
| Role → group assignment | `UM_USER_ROLE` + `UM_HYBRID_USER_ROLE` | `group_user_mapping` (main DB) |

**What is NOT migrated:** refresh tokens, OIDC sessions, audit logs, custom attributes beyond display name, or project/environment data (which does not exist in ICP v1).

---

## Conflict resolution

The ICP v2 init scripts seed a default `admin` user. When the migration script encounters a username that already exists in the new database it applies the following rules:

| Existing username in new DB | Action |
|---|---|
| `admin` | **Merge** — keep the v2 UUID and group membership intact; overwrite `password_hash`/`password_salt` with old system values |
| any other username | **Replace** — delete the pre-existing v2 user (and their group mappings) then insert the old system's version of that user with its original UUID |

The replace strategy gives the old system full priority: any user account that was pre-created in ICP v2 before migration (other than the seed admin) will be overwritten by the migrated account.

---

## Password migration

ICP v1 stored passwords as:

```text
Base64( Digest( password + salt ) )
```

where `Digest` is the algorithm set in `user-mgt.xml` → `PasswordDigest` (default: `SHA-256`). Salt storage is controlled by `StoreSaltedPassword` (default: `true`).

ICP v2's default authentication backend (`default_user_service.bal`) supports the **same algorithm family** via the `passwordHashingAlgorithm` setting in `Config.toml`:

| Old `PasswordDigest` value | ICP v2 `passwordHashingAlgorithm` |
|---|---|
| `SHA-256` *(default)* | `sha-256` |
| `SHA-1` / `SHA` | `sha-1` |
| `SHA-384` | `sha-384` |
| `SHA-512` | `sha-512` |
| `MD5` | `md5` |
| *(null / `PLAIN_TEXT`)* | `plain_text` |

The migration script copies hashes and salts **as-is**. After migration, set `passwordHashingAlgorithm` in `Config.toml` to match your old `PasswordDigest` value. Migrated users will not be forced to change their password on first login by default. Set `@reset_passwords = TRUE` in the script configuration to require a password change on first login.

---

## Role → group mapping

ICP v1 used flat WSO2 roles. ICP v2 uses a group-based RBAC model. The migration applies a simple two-bucket mapping:

| Old role (`UM_ROLE` or `UM_HYBRID_ROLE`) | ICP v2 group |
|---|---|
| `admin` / `Internal/admin` | Super Admins |
| any other role (or no role) | Developers |

Users assigned to Super Admins also get `is_super_admin = TRUE` in the `users` table.
