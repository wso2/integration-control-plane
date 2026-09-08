# ICP Database Migration Scripts

This directory contains **in-place v2 schema upgrade** scripts — they bring an existing ICP v2
database up to the current schema.

For migrating user accounts, credentials, and role assignments from **ICP v1**, see
[`../icp-1.2.x-to-2.x.x/`](../icp-1.2.x-to-2.x.x/).

---

## Upgrading an existing ICP v2 deployment: workflow feature

Deployments whose database was initialised **before the workflow management feature** (v2.0.0-beta2 and earlier) must run the workflow upgrade script once against the **main ICP DB** — **before** deploying this server version. Fresh installs do not need it — the `*_init.sql` scripts already contain everything.

Without it, two things break. Workflow views fail with `Column "CALLBACK_URL" not found` and no Workflow-Management permissions appear in Access Control (even for Super Admin). Worse, **every full heartbeat fails** — for MI runtimes as much as BI ones: `upsertWorkflowMetadata` issues `DELETE FROM bi_workflow_metadata` for the reporting runtime before checking whether the heartbeat carries any metadata, so a missing table errors out that statement and aborts the whole heartbeat transaction.

Pick the script matching your database engine:

| Engine | Script |
|---|---|
| H2 | `add_workflow_feature_h2.sql` |
| MySQL / MariaDB | `add_workflow_feature_mysql.sql` |
| PostgreSQL | `add_workflow_feature_postgresql.sql` |
| Microsoft SQL Server | `add_workflow_feature_mssql.sql` |
| Oracle (19c+) | `add_workflow_feature_oracle.sql` |

Each script applies, in order:

1. `runtimes.callback_url` — retained for schema compatibility: heartbeat writes still reference the column, but nothing populates it now that workflow management goes through the command tunnel
2. The `Workflow-Management` permission domain (widens the domain constraint / ENUM)
3. The four `workflow_mgt:*` permissions (human tasks + workflow executions)
4. Role grants — Super Admin / Admin / Project Admin: view + manage both; Developer: manage human tasks, view workflows; Viewer: view human tasks only
5. `bi_workflow_metadata` — the workflow metadata document and advertised capabilities a BI runtime publishes in its full heartbeat (one row per runtime, replaced on every full heartbeat, removed with the runtime via `ON DELETE CASCADE`)

The scripts are **idempotent** — safe to re-run, including after a partial failure. After running, restart the ICP server (or have users re-login) so sessions pick up the new permissions.

Example (H2, server may stay running thanks to `AUTO_SERVER`):

```bash
java -cp <path-to-h2.jar> org.h2.tools.RunScript \
  -url "jdbc:h2:file:./database/icp_db;MODE=MySQL;AUTO_SERVER=TRUE" \
  -user <db_user> -password <db_password> \
  -script add_workflow_feature_h2.sql
```

```bash
# MySQL
mysql -u <admin_user> -p <icp_db_name> < add_workflow_feature_mysql.sql

# PostgreSQL
psql -U <admin_user> -d <icp_db_name> -f add_workflow_feature_postgresql.sql

# Microsoft SQL Server
sqlcmd -S <server> -U <user> -P <password> -d <icp_db_name> -i add_workflow_feature_mssql.sql

# Oracle (run as the ICP schema owner)
sqlplus <icp_schema_user>/<password>@//<host>:1521/<service_name> @add_workflow_feature_oracle.sql
```

---

## Upgrading an existing ICP v2 deployment: workflow command-tunnel cache

Deployments upgrading to the **database-backed command tunnel** must also run the cache-tables
script once against the **main ICP DB** — `add_workflow_feature_*.sql` alone is not enough.
Fresh installs do not need it — the `*_init.sql` scripts already contain everything.

Without it, every workflow view fails at its first read: the tunnel answers reads and queues
mutations in one `tunneled_operation` table, and a missing table turns each request into a 500.

The table is **derived state**: it may be dropped and recreated on any upgrade with nothing to
migrate — losing a row costs one refetch, or one caller being told their operation was never
confirmed. The scripts only ever create; they are idempotent and safe to re-run.

Pick the script matching your database engine — `add_cache_tables_h2.sql`,
`add_cache_tables_mysql.sql`, `add_cache_tables_postgresql.sql`, `add_cache_tables_mssql.sql`,
or `add_cache_tables_oracle.sql` — and run it exactly like the workflow-feature script above.

---

## Upgrading an existing ICP v2 deployment: packed OpenAPI definitions

Deployments whose database was initialised **before BI runtimes could report packed OpenAPI
(Swagger) definitions** must run the OpenAPI definitions upgrade script once against the
**main ICP DB** — **before** deploying this server version. Fresh installs do not need it —
the `*_init.sql` scripts already contain everything.

Without it, every full heartbeat fails: `upsertOpenApiDefinitions` unconditionally issues
`DELETE FROM bi_service_openapi_definitions` for the reporting runtime before checking whether
the heartbeat carries any OpenAPI definitions, so a missing table errors out that statement and
aborts the whole heartbeat transaction — for BI and MI runtimes alike, not just BI runtimes with
`remoteManagement` enabled.

Pick the script matching your database engine:

| Engine | Script |
|---|---|
| H2 | `add_openapi_definitions_h2.sql` |
| MySQL / MariaDB | `add_openapi_definitions_mysql.sql` |
| PostgreSQL | `add_openapi_definitions_postgresql.sql` |
| Microsoft SQL Server | `add_openapi_definitions_mssql.sql` |
| Oracle (19c+) | `add_openapi_definitions_oracle.sql` |

Each script adds the `bi_service_openapi_definitions` table (one row per packed OpenAPI file per
runtime, keyed by `(runtime_id, file_name)`, cascade-deleted with the runtime).

The scripts are **idempotent** — safe to re-run. No server restart is required; the next
heartbeat from an updated `icp-runtime-bridge` agent starts populating the table.

```bash
# H2 (server may stay running thanks to AUTO_SERVER)
java -cp <path-to-h2.jar> org.h2.tools.RunScript \
  -url "jdbc:h2:file:./database/icp_db;MODE=MySQL;AUTO_SERVER=TRUE" \
  -user <db_user> -password <db_password> \
  -script add_openapi_definitions_h2.sql

# MySQL
mysql -u <admin_user> -p <icp_db_name> < add_openapi_definitions_mysql.sql

# PostgreSQL
psql -U <admin_user> -d <icp_db_name> -f add_openapi_definitions_postgresql.sql

# Microsoft SQL Server
sqlcmd -S <server> -U <user> -P <password> -d <icp_db_name> -i add_openapi_definitions_mssql.sql

# Oracle (run as the ICP schema owner)
sqlplus <icp_schema_user>/<password>@//<host>:1521/<service_name> @add_openapi_definitions_oracle.sql
```

---

## Upgrading an existing ICP v2 deployment: service-to-listener bindings

Deployments whose database was initialised **before runtimes reported which listeners each
service is attached to** must run the service-listener-bindings upgrade script once against the
**main ICP DB** — **before** deploying this server version. Fresh installs do not need it — the
`*_init.sql` scripts already contain everything.

Without it, every full heartbeat fails: `insertRuntimeArtifacts` unconditionally issues
`DELETE FROM bi_service_listener_bindings` for the reporting runtime before inserting its
services, so a missing table errors out that statement and aborts the whole heartbeat
transaction.

Pick the script matching your database engine:

| Engine | Script |
|---|---|
| H2 | `add_service_listener_bindings_h2.sql` |
| MySQL / MariaDB | `add_service_listener_bindings_mysql.sql` |
| PostgreSQL | `add_service_listener_bindings_postgresql.sql` |
| Microsoft SQL Server | `add_service_listener_bindings_mssql.sql` |
| Oracle (19c+) | `add_service_listener_bindings_oracle.sql` |

Each script adds the `bi_service_listener_bindings` table — many-to-many, keyed by
`(runtime_id, service_name, service_package, listener_name)` and cascade-deleted with the
runtime — plus indexes for lookups by service and by listener. The binding arrives in the
heartbeat as `heartbeat.artifacts.services[].listeners` and is keyed to
`bi_runtime_listener_artifacts` by `(runtime_id, listener_name)`.

The scripts are **idempotent** — safe to re-run. No server restart is required; the next
heartbeat starts populating the table.

```bash
# H2 (server may stay running thanks to AUTO_SERVER)
java -cp <path-to-h2.jar> org.h2.tools.RunScript \
  -url "jdbc:h2:file:./database/icp_db;MODE=MySQL;AUTO_SERVER=TRUE" \
  -user <db_user> -password <db_password> \
  -script add_service_listener_bindings_h2.sql

# MySQL
mysql -u <admin_user> -p <icp_db_name> < add_service_listener_bindings_mysql.sql

# PostgreSQL
psql -U <admin_user> -d <icp_db_name> -f add_service_listener_bindings_postgresql.sql

# Microsoft SQL Server
sqlcmd -S <server> -U <user> -P <password> -d <icp_db_name> -i add_service_listener_bindings_mssql.sql

# Oracle (run as the ICP schema owner)
sqlplus <icp_schema_user>/<password>@//<host>:1521/<service_name> @add_service_listener_bindings_oracle.sql
```

---

## Upgrading an existing ICP v2 deployment: integration types

Deployments whose database was initialised **before integrations carried a type** must run the
integration types upgrade script once against the **main ICP DB** — **before** deploying this
server version. Fresh installs do not need it — the `*_init.sql` scripts already contain
everything.

Without it, every component read fails: the component queries now select `c.display_type` and
`c.component_sub_type`, so a missing column errors out the statement — breaking the project and
integration listings, not just the create form.

Pick the script matching your database engine:

| Engine | Script |
|---|---|
| H2 | `add_integration_types_h2.sql` |
| MySQL / MariaDB | `add_integration_types_mysql.sql` |
| PostgreSQL | `add_integration_types_postgresql.sql` |
| Microsoft SQL Server | `add_integration_types_mssql.sql` |
| Oracle (19c+) | `add_integration_types_oracle.sql` |

Each script adds two columns to `components`:

1. `display_type` — the integration type itself (`ballerinaService`, `miApiService`,
   `scheduledTask`, `miCronjob`), defaulting to `service`
2. `component_sub_type` — discriminates types that share a generic service `display_type`
   (AI Agent, MCP Server, File Integration); `NULL` for the rest

Existing rows backfill to `service`, which is exactly what the server previously reported for
every component, so nothing changes for them.

The scripts are **idempotent** — safe to re-run.

```bash
# H2 (server may stay running thanks to AUTO_SERVER)
java -cp <path-to-h2.jar> org.h2.tools.RunScript \
  -url "jdbc:h2:file:./database/icp_db;MODE=MySQL;AUTO_SERVER=TRUE" \
  -user <db_user> -password <db_password> \
  -script add_integration_types_h2.sql

# MySQL
mysql -u <admin_user> -p <icp_db_name> < add_integration_types_mysql.sql

# PostgreSQL
psql -U <admin_user> -d <icp_db_name> -f add_integration_types_postgresql.sql

# Microsoft SQL Server
sqlcmd -S <server> -U <user> -P <password> -d <icp_db_name> -i add_integration_types_mssql.sql

# Oracle (run as the ICP schema owner)
sqlplus <icp_schema_user>/<password>@//<host>:1521/<service_name> @add_integration_types_oracle.sql
```

---

## Upgrading an existing ICP v2 deployment: SSO group mapping

Deployments whose database was initialised **before SSO-driven group membership** must run the
SSO group mapping upgrade script once against the **main ICP DB** — **before** deploying this
server version. Fresh installs do not need it — the `*_init.sql` scripts already contain
everything.

**This applies to every deployment, not just those using SSO.** The script rebinds the core
RBAC access views onto a new membership view, and `buildUserAuthzContext` — the authorization
context built for authenticated requests — resolves a user's groups through it regardless of
whether SSO is configured. Without the script, those queries reference objects that do not
exist and authorization fails, so it is not optional for password-only deployments.

If the script has not been run, SSO login fails and the server responds with:

> This update adds new SSO capabilities that need a one-time update to the ICP database.
> Update the database and restart ICP to continue using SSO.

The accompanying server log names the exact script to apply. This is reported on **every**
SSO login, not only when SSO group mappings are configured: login-time reconciliation reads
these tables on each login to work out which memberships should be added or removed, so an
empty mapping list still requires the tables to exist.

Pick the script matching your database engine:

| Engine | Script |
|---|---|
| H2 | `add_sso_group_mapping_tables_h2.sql` |
| MySQL / MariaDB | `add_sso_group_mapping_tables_mysql.sql` |
| PostgreSQL | `add_sso_group_mapping_tables_postgresql.sql` |
| Microsoft SQL Server | `add_sso_group_mapping_tables_mssql.sql` |
| Oracle (19c+) | `add_sso_group_mapping_tables_oracle.sql` |

Each script applies, in order:

1. `sso_group_mappings` — maps an IdP claim value to an ICP group, with optional project or
   integration scope
2. `federated_group_user_mapping` — SSO-owned group memberships, kept separate from the manual
   ones in `group_user_mapping` so the two can be told apart and managed independently
3. `v_effective_group_user_mapping` — a `UNION` of manual and SSO-owned memberships
4. Rebinds `v_user_project_access`, `v_user_integration_access` and `v_user_environment_access`
   onto that view, so permission resolution honours federated memberships

Step 4 is the reason this is more than a table addition: the three access views already exist in
a pre-SSO database, reading `group_user_mapping` directly. Their column lists do not change —
only the membership source — and the definitions match the `*_init.sql` ones, so a migrated
schema ends up identical to a fresh install.

The scripts are **idempotent** — safe to re-run, including after a partial failure. No data
backfill is involved: federated memberships are recorded as users log in through the IdP.

```bash
# H2 (server may stay running thanks to AUTO_SERVER)
java -cp <path-to-h2.jar> org.h2.tools.RunScript \
  -url "jdbc:h2:file:./database/icp_db;MODE=MySQL;AUTO_SERVER=TRUE" \
  -user <db_user> -password <db_password> \
  -script add_sso_group_mapping_tables_h2.sql

# MySQL
mysql -u <admin_user> -p <icp_db_name> < add_sso_group_mapping_tables_mysql.sql

# PostgreSQL
psql -U <admin_user> -d <icp_db_name> -f add_sso_group_mapping_tables_postgresql.sql

# Microsoft SQL Server
sqlcmd -S <server> -U <user> -P <password> -d <icp_db_name> -i add_sso_group_mapping_tables_mssql.sql

# Oracle (run as the ICP schema owner)
sqlplus <icp_schema_user>/<password>@//<host>:1521/<service_name> @add_sso_group_mapping_tables_oracle.sql
```