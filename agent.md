# agents.md — WSO2 Integration Control Plane (ICP)

<!--
  This file provides product context for AI-assisted bug fix skills.
  Place this file at the root of your repository and fill in each section.

  Sections marked [REQUIRED] are read by skills and will block execution if missing.
  Sections marked [OPTIONAL] improve quality but skills will still run without them.

  Completeness guidance:
  - REQUIRED sections must have substantive content, not just placeholders.
  - Architecture must include the module map table with all top-level modules listed.
  - Feature Inventory must list at least the major features with entry points.
  - Deployment must include working build and run commands.
  - Testing must specify the framework, naming conventions, and runnable test commands.
  - Coding Conventions must cover at minimum style/formatting and commit message format.
  - Contribution Guidelines must describe the PR process and available labels.
-->

## Product Overview

WSO2 Integration Control Plane (ICP) is a unified management and observability platform for WSO2 integration runtimes. It enables developers and operators to monitor deployment health, manage integration artifacts, control runtime behavior, and troubleshoot issues from a single dashboard backed by a GraphQL API. It supports both Micro Integrator (MI) and Ballerina Integration (BI) runtime deployments with multi-tenant capabilities and RBAC v2 authorization.

**Version:** 2.0.0-SNAPSHOT
**License:** Apache 2.0
**Users:** Integration developers, DevOps engineers, and platform operators managing WSO2 MI/BI runtimes.

## Architecture [REQUIRED]
<!-- Used by: /plan-fix, /review-plan -->

### System Architecture

ICP is a **modular monolith** with a Ballerina backend exposing multiple HTTP services on dedicated ports, and a React SPA frontend. In production, the frontend is served by the backend (`webserver.bal` on port 9445); during development, Vite serves the frontend on port 5173.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser / Frontend                          │
│                    React SPA (port 5173 dev)                        │
└──────┬──────────────────┬──────────────────┬────────────────────────┘
       │                  │                  │
       │ GraphQL          │ REST             │ REST
       │ (data CRUD)      │ (auth)           │ (logs/metrics)
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│ GraphQL API  │  │  Auth REST   │  │  Observability API   │
│  port 9446   │  │  port 9445   │  │     port 9448        │
│  /graphql    │  │  /auth/*     │  │ /icp/observability/* │
└──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘
       │                 │                      │
       │    ┌────────────┤                      │
       │    │            │                      │
       ▼    ▼            ▼                      ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Auth Module    │  │ Auth Backend │  │ OpenSearch Adapter│
│ (RBAC, context) │  │  port 9447   │  │    port 9449     │
└────────┬────────┘  └──────────────┘  └────────┬─────────┘
         │                                      │
         ▼                                      ▼
┌─────────────────┐                    ┌──────────────────┐
│ Storage Module  │                    │    OpenSearch     │
│ (repositories)  │                    │   port 9200      │
└────────┬────────┘                    └──────────────────┘
         │
         ▼
┌─────────────────┐
│    Database     │
│ MySQL/PG/MSSQL/ │
│       H2        │
└─────────────────┘

┌─────────────────────────────────────────┐
│        MI / BI Runtimes                 │
│  POST /icp/heartbeat (port 9445)        │
│  JWT with kid → org secret validation   │
└─────────────────────────────────────────┘
```

### Module/Component Map [REQUIRED]
<!-- Used by: /reproduce (to identify affected components) -->

| Module | Path | Responsibility |
|--------|------|----------------|
| GraphQL API | `icp_server/graphql_api.bal` | Main data API — CRUD for projects, environments, components, runtimes, artifacts, users, groups, roles, permissions, secrets, loggers (~3700 LOC) |
| Auth REST API | `icp_server/auth_service.bal` | Authentication — login, logout, token refresh, SSO, user management, capabilities (~3000 LOC) |
| Runtime Heartbeat | `icp_server/runtime_service.bal` | Runtime registration, status updates, artifact sync, lazy component binding |
| Observability API | `icp_server/observability_service.bal` | Log search, registry browsing, metrics proxying |
| OpenSearch Adapter | `icp_server/opensearch_adapter_service.bal` | OpenSearch query translation, JWT-authenticated internal service |
| Default User Backend | `icp_server/default_user_service.bal` | Built-in username/password auth and user CRUD (port 9447) |
| LDAP User Backend | `icp_server/ldap_user_service.bal` | LDAP directory authentication adapter (port 9450) |
| Web Server | `icp_server/webserver.bal` | Static SPA serving, runtime config.json injection |
| Offline Scheduler | `icp_server/runtime_offline_scheduler.bal` | Marks stale runtimes as OFFLINE (default 600s interval) |
| Token Cleanup Scheduler | `icp_server/refresh_token_cleanup_scheduler.bal` | Removes expired refresh tokens (default 86400s interval) |
| Init & Config | `icp_server/init.bal`, `icp_server/config.bal`, `icp_server/main.bal` | DB initialization, configurable parameters, application entry point |
| Storage Module | `icp_server/modules/storage/` | Repository pattern DB access layer — one `*_repository.bal` per domain entity (16 files, ~8.4K LOC) |
| Auth Module | `icp_server/modules/auth/` | JWT extraction, RBAC v2 permission evaluation, OIDC flow (5 files) |
| Types Module | `icp_server/modules/types/` | Shared domain type definitions — `types.bal`, `auth_types.bal`, `mi_management_types.bal` |
| Utils Module | `icp_server/modules/utils/` | Encryption/decryption (WSO2 cipher tool), general utilities |
| MI Management Module | `icp_server/modules/mi_management/` | HTTP client to MI runtime management APIs (fetch/enable/disable artifacts, loggers) |
| Observability Module | `icp_server/modules/observability/` | OpenSearch index schema and field definitions |
| Backend Tests | `icp_server/tests/` | Auth, GraphQL, token tests (12 files, ~4.5K LOC) |
| DB Scripts | `icp_server/resources/db/` | Init scripts (4 dialects) and migration scripts |
| Frontend Pages | `frontend/src/pages/` | React page components — one per route (35+ files) |
| Frontend Components | `frontend/src/components/` | Shared/reusable React UI components (20+ files) |
| Frontend API Layer | `frontend/src/api/` | GraphQL queries/mutations, REST auth/logs/metrics clients (9 files) |
| Frontend Config | `frontend/src/config/` | Route definitions (`routes.tsx`), API URLs (`api.ts`) |
| Frontend Auth | `frontend/src/auth/` | Frontend auth state management (context and hooks) |
| Frontend Paths | `frontend/src/paths.ts` | Single source of truth for all URL path constants |
| Distribution | `distribution/` | Startup scripts (`icp.sh`, `icp.bat`), config templates, packaging |
| Kubernetes | `kubernetes/` | K8s deployment manifests (Deployment, Service, Gateway, cert-manager) |
| CI/CD | `.github/workflows/` | PR check (`pr-check.yml`) and release (`release.yml`) workflows |

### Key Abstractions & Patterns
<!-- Used by: /plan-fix (to align fixes with existing patterns) -->

- **Repository Pattern**: Each domain entity (Project, Environment, Component, Runtime, Artifact, User, etc.) has a dedicated `*_repository.bal` in `modules/storage/` for all DB operations.
- **Database Dialect Abstraction**: `database_dialect.bal` generates vendor-specific SQL for MySQL, PostgreSQL, MSSQL, and H2. All schema changes must be applied to all 4 dialects.
- **Service-per-Port**: Each Ballerina service binds to a dedicated port (9445-9450). Services are defined as top-level `.bal` files.
- **RBAC v2 Model**: User → Group → Role → Permission with hierarchical scopes (Organization → Project → Environment → Component). Permission checks use `modules/auth/permission_checker.bal`.
- **JWT Authentication**: HS256 HMAC for frontend-server communication, RSA/symmetric for inter-service and runtime heartbeat (with `kid` key ID lookup against org secrets).
- **Configurable Parameters**: All settings in `config.bal` using Ballerina's `configurable` keyword. Encrypted values use `$secret{alias}` resolved via `Config.toml`'s `[secrets]` map.
- **Separate Credentials Database**: User credentials stored in a separate database schema for security isolation.
- **Runtime Configuration (Frontend)**: Backend URLs loaded from `public/config.json` at runtime (no rebuild needed). The backend's `webserver.bal` updates this file on startup.
- **TanStack React Query**: Frontend uses `@tanstack/react-query` v5 for data fetching, caching, and server state management.

### Error Handling Patterns [OPTIONAL]
<!-- Used by: /implement, /code-review -->

**Backend (Ballerina):**
- Use Ballerina's `check` keyword for error propagation.
- Use `error` type for domain errors.
- Database errors are mapped to application-level errors in `modules/storage/error_mapper.bal`.
- Parameterized queries are mandatory to prevent SQL injection.

**Frontend (React):**
- State handling order is strictly enforced: Loading → Error → Not Found → Empty Listing → Data.
- Early return before reaching the main view — never render data views until data is ready.
- Error states must include retry capability.

### Logging Conventions [OPTIONAL]
<!-- Used by: /implement, /code-review -->

- Backend uses Ballerina's built-in `log` module.
- Log levels: `DEBUG`, `INFO`, `WARN`, `ERROR` (configurable via `logLevel` in `Config.toml`).
- Audit logging enabled via `enableAuditLogging = true` in config.
- Metrics enabled via `enableMetrics = true` in config.
- Runtimes ship logs to OpenSearch via Fluent Bit; ICP provides log search through the Observability API.

### Inter-Component Communication [OPTIONAL]

- **Frontend → Backend**: GraphQL (port 9446) for data CRUD; REST (port 9445) for auth; REST (port 9448) for observability.
- **Backend Services → Storage Module**: Direct Ballerina module imports (in-process function calls).
- **Auth Service → Auth Backend**: HTTP calls to the user backend service (port 9447 for default, port 9450 for LDAP).
- **ICP → MI Runtimes**: HTTP client calls via `modules/mi_management/` to fetch/manage artifacts and loggers on runtime instances.
- **MI/BI Runtimes → ICP**: Periodic heartbeat POST to `/icp/heartbeat` (port 9445) with JWT bearer token.
- **Observability Service → OpenSearch Adapter**: Internal HTTP calls (port 9449), JWT-authenticated with short expiry.
- **OpenSearch Adapter → OpenSearch**: HTTP/HTTPS queries to OpenSearch (port 9200).

## Feature Inventory [REQUIRED]
<!-- Used by: /reproduce, /plan-fix -->

| Feature | Entry Point(s) | Related Components |
|---------|----------------|--------------------|
| Project Management | `icp_server/graphql_api.bal` (projects, createProject, updateProject, deleteProject), `frontend/src/pages/Projects.tsx`, `frontend/src/pages/CreateProject.tsx`, `frontend/src/pages/Project.tsx` | `storage/project_repository.bal`, `types/types.bal`, `frontend/src/api/queries.ts`, `frontend/src/api/mutations.ts` |
| Environment Management | `icp_server/graphql_api.bal` (environments, createEnvironment, updateEnvironment, deleteEnvironment), `frontend/src/pages/Environments.tsx`, `frontend/src/pages/CreateEnvironment.tsx`, `frontend/src/pages/EditEnvironment.tsx` | `storage/environment_repository.bal`, `types/types.bal` |
| Component/Integration Management | `icp_server/graphql_api.bal` (components, createComponent, updateComponent, deleteComponent), `frontend/src/pages/Components.tsx`, `frontend/src/pages/CreateComponent.tsx`, `frontend/src/pages/Component.tsx`, `frontend/src/pages/ComponentEditor.tsx` | `storage/component_repository.bal`, `types/types.bal` |
| Runtime Heartbeat & Monitoring | `icp_server/runtime_service.bal` (POST /icp/heartbeat), `frontend/src/pages/OrgRuntimes.tsx`, `frontend/src/pages/Runtime.tsx` | `storage/runtime_repository.bal`, `storage/heartbeat_repository.bal`, `runtime_offline_scheduler.bal` |
| MI Artifact Management | `icp_server/graphql_api.bal` (restApis, proxyServices, endpoints, sequences, tasks, etc.), `frontend/src/pages/Component.tsx` | `modules/mi_management/`, `storage/artifact_repository.bal`, `types/mi_management_types.bal` |
| Artifact State Control | `icp_server/graphql_api.bal` (updateArtifactStatus, updateArtifactTracingStatus, updateArtifactStatisticsStatus), `frontend/src/api/artifactToggleMutations.ts` | `modules/mi_management/mi_management.bal` |
| Authentication (Login/Logout) | `icp_server/auth_service.bal` (/auth/login, /auth/token/refresh, /auth/change-password), `frontend/src/pages/Login.tsx` | `default_user_service.bal`, `ldap_user_service.bal`, `modules/auth/`, `frontend/src/api/auth.ts` |
| OIDC/SSO Authentication | `icp_server/auth_service.bal` (/auth/sso/config, /auth/sso/token), `frontend/src/pages/OIDCCallback.tsx` | `modules/auth/oidc.bal`, `icp_server/custom_auth/OIDC_SETUP_GUIDE.md` |
| RBAC v2 (Users, Groups, Roles, Permissions) | `icp_server/graphql_api.bal` (user/group/role/permission queries and mutations), `frontend/src/pages/access-control/`, `frontend/src/pages/CreateUser.tsx`, `frontend/src/pages/CreateGroup.tsx`, `frontend/src/pages/CreateRole.tsx` | `modules/auth/permission_checker.bal`, `modules/auth/access_resolver.bal`, `storage/auth_repository.bal`, `types/auth_types.bal` |
| Secret Management | `icp_server/graphql_api.bal` (org secrets, secret bindings), `frontend/src/pages/` | `storage/secret_repository.bal`, `modules/utils/cipher.bal` |
| Logger Management | `icp_server/graphql_api.bal` (loggersByRuntime, updateLogLevel), `frontend/src/pages/ManageLoggers.tsx` | `modules/mi_management/mi_management.bal` |
| Log Viewing (Observability) | `icp_server/observability_service.bal`, `frontend/src/pages/RuntimeLogs.tsx` | `opensearch_adapter_service.bal`, `modules/observability/spec.bal` |
| Registry Resource Browsing | `icp_server/observability_service.bal`, `frontend/src/pages/` | `modules/mi_management/mi_management.bal` |
| Metrics & Analytics | `icp_server/observability_service.bal`, `frontend/src/pages/Metrics.tsx`, `frontend/src/pages/Analytics.tsx` | `frontend/src/api/metrics.ts` |
| Token Refresh & Rotation | `icp_server/auth_service.bal` (/auth/token/refresh), `refresh_token_cleanup_scheduler.bal` | `storage/auth_token_repository.bal` |
| SPA Serving & Runtime Config | `icp_server/webserver.bal` | `frontend/public/config.json` |

## Deployment [REQUIRED]
<!-- Used by: /reproduce, /implement -->

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Java | 17+ | Gradle build system |
| Ballerina | 2201.13.1 | Backend compilation and runtime |
| Node.js | 20+ | Frontend build |
| pnpm | 10+ | Frontend package manager |
| Docker & Docker Compose | Latest | Containerized deployment (recommended) |

### Build & Run

```bash
# Full build (produces distribution ZIP)
./gradlew build
# or
./build.sh
# Output: build/distribution/wso2-integration-control-plane-<version>.zip

# Backend only
cd icp_server && bal build

# Frontend only
cd frontend && pnpm install && pnpm build

# --- Running locally ---

# Backend with H2 (quickest local setup)
docker-compose -f icp_server/docker-compose.local.yml up --build

# Backend with MySQL
docker-compose -f icp_server/docker-compose.mysql.yml up --build

# Backend with Ballerina directly (requires Config.toml setup)
cd icp_server && bal run

# Frontend dev server (separate terminal)
cd frontend && pnpm install && pnpm dev
# Available at http://localhost:5173

# Default credentials: admin / admin
```

### Build Scope [OPTIONAL]
<!-- Used by: /reproduce, /implement -->

| Module | Build Command | Dependents |
|--------|--------------|------------|
| Full project | `./gradlew build` | — |
| Backend only | `cd icp_server && bal build` | Distribution packaging |
| Frontend only | `cd frontend && pnpm install && pnpm build` | Distribution packaging, `www/` static assets |
| H2 Database init | `./gradlew initH2Database initH2CredentialsDatabase` | Backend tests with H2 |
| Distribution package | `./gradlew packageICP` | Requires backend + frontend builds |

### Timeouts [OPTIONAL]
<!-- Used by: /reproduce, /implement -->

- **Build timeout:** 30 minutes (full Gradle build including frontend)
- **Product startup timeout:** 2 minutes (backend with H2), 5 minutes (with external DB)
- **Reproduction attempt timeout:** 10 minutes

### Configuration [OPTIONAL]

- **Main config file:** `icp_server/Config.toml` — database, auth, logging, LDAP, OIDC, token expiry, TLS
- **Frontend runtime config:** `frontend/public/config.json` — backend URLs (no rebuild needed)
- **Gradle properties:** `gradle.properties` — project version, JVM settings, Docker config
- **Ballerina project config:** `icp_server/Ballerina.toml` — package metadata
- **TLS keystores:** `conf/security/wso2carbon.jks`, `conf/security/client-truststore.jks`
- **Distribution config templates:** `distribution/src/main/resources/conf/`

**Port reference:**

| Port | Service | Path |
|------|---------|------|
| 9445 | Main HTTP (Auth REST + SPA + heartbeat) | `/auth/*`, `/icp/heartbeat`, `/` |
| 9446 | GraphQL API | `/graphql` |
| 9447 | Default auth backend (internal) | — |
| 9448 | Observability service | `/icp/observability/*` |
| 9449 | OpenSearch adapter (internal) | — |
| 9450 | LDAP auth backend (internal) | — |
| 5173 | Frontend dev server (Vite) | `/` |

### Health Check

- **Backend started:** Log message `ICP server started` in console output; HTTPS GET `https://localhost:9445/` returns the SPA HTML.
- **GraphQL API:** POST `https://localhost:9446/graphql` with a valid query returns a JSON response.
- **Auth API:** GET `https://localhost:9445/auth/capabilities` returns supported auth features.
- **Frontend dev server:** HTTP GET `http://localhost:5173/` returns the React app.

### Database & Migrations [OPTIONAL]
<!-- Used by: /reproduce, /implement -->

**Supported databases:** MySQL 8.0+, PostgreSQL 12+, MSSQL 2019+, H2 (in-memory for dev/testing).

**Schema location:** `icp_server/resources/db/init-scripts/`

| Script | Purpose |
|--------|---------|
| `mysql_init.sql` | MySQL main schema |
| `postgresql_init.sql` | PostgreSQL main schema |
| `mssql_init.sql` | MSSQL main schema |
| `h2_init.sql` | H2 main schema |
| `credentials_mysql_init.sql` | MySQL credentials DB |
| `credentials_postgresql_init.sql` | PostgreSQL credentials DB |
| `credentials_mssql_init.sql` | MSSQL credentials DB |
| `credentials_h2_init.sql` | H2 credentials DB |
| `h2_test_data.sql` | H2 test data |
| `mysql_test_data_init.sql` | MySQL test data |

**Migration tool:** Manual SQL scripts in `icp_server/resources/db/migration-scripts/`.

**Local dev database setup:** Use Docker Compose — `docker-compose -f icp_server/docker-compose.mysql.yml up --build` auto-initializes the database.

**Credentials database:** A separate database/schema stores user credentials (passwords) for security isolation. Same vendor as the main database.

**When modifying schema:**
1. Update ALL 4 dialect files in `icp_server/resources/db/init-scripts/`
2. Update credentials DB scripts if auth-related
3. Add migration SQL in `icp_server/resources/db/migration-scripts/`
4. Update the corresponding `*_repository.bal` in `icp_server/modules/storage/`
5. Update type definitions in `icp_server/modules/types/`

## Testing [REQUIRED]
<!-- Used by: /plan-fix, /implement -->

### Test Framework & Conventions

- **Framework (Backend):** Ballerina built-in test framework (`ballerina/test` module)
- **Framework (Frontend):** Vitest / pnpm test
- **Naming convention (Backend):** Test functions annotated with `@test:Config`, descriptive function names
- **Unit test location (Backend):** `icp_server/tests/`
- **Integration test location:** Docker Compose tests via `icp_server/docker-compose.test.yml` (runs against MySQL)

**Backend test files:**

| File | Coverage Area |
|------|---------------|
| `auth_tests_v2.bal` | RBAC v2 authorization tests (998 LOC) |
| `oidc_tests.bal` | OIDC flow tests |
| `component_graphql_tests.bal` | Component management GraphQL tests |
| `environment_graphql_tests.bal` | Environment management GraphQL tests |
| `project_graphql_tests.bal` | Project management GraphQL tests |
| `runtime_graphql_tests.bal` | Runtime management GraphQL tests |
| `refresh_token_api_tests.bal` | Refresh token API tests |
| `refresh_token_storage_tests.bal` | Token storage tests |
| `refresh_token_utils_tests.bal` | Token utility tests |
| `token_renew_tests.bal` | Token renewal tests |
| `test_utils.bal` | Test utilities and helpers |
| `mock_oidc_provider.bal` | Mock OIDC provider for testing |

### Running Tests

```bash
# Run all backend tests (locally, uses H2)
cd icp_server && bal test

# Run backend tests with Docker (matches CI, uses MySQL)
docker-compose -f icp_server/docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from icp-server-test

# Run frontend tests
cd frontend && pnpm test

# Initialize H2 databases for local testing
./gradlew initH2Database initH2CredentialsDatabase
```

### Test Infrastructure [OPTIONAL]

- **Mock OIDC Provider:** `icp_server/tests/mock_oidc_provider.bal` — standalone mock OIDC server for testing SSO flows.
- **Test Utilities:** `icp_server/tests/test_utils.bal` — shared test helpers, setup, and teardown.
- **Docker Compose Test:** `icp_server/docker-compose.test.yml` — MySQL-backed test environment matching CI.
- **Test Data:** `icp_server/resources/db/init-scripts/h2_test_data.sql` and `mysql_test_data_init.sql` for seeding test databases.

## Coding Conventions [REQUIRED]
<!-- Used by: /implement, /code-review -->

### Style & Formatting

**Backend (Ballerina):**
- Files: `snake_case.bal`
- Functions: `camelCase`
- Types/Records: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- One service per top-level `.bal` file, bound to a specific port
- Repository pattern: one `*_repository.bal` per domain entity in `modules/storage/`
- Types defined in `modules/types/` (not inline)
- Auth checks via `modules/auth/permission_checker.bal` functions
- Configuration via `configurable` keyword in `config.bal`; encrypted values use `$secret{alias}` pattern; all code outside `config.bal` must use `resolved*` variables for encrypted values
- Use parameterized queries (prevent SQL injection)
- Add SQL for ALL 4 dialects when modifying schema

**Frontend (React + TypeScript):**
- **Mandatory reading:** `frontend/HOUSE_RULES.md`
- Prettier enforced in CI — config: `printWidth: 260`, `singleQuote: true`, `bracketSameLine: true`
- ESLint: `@eslint/js` recommended + `typescript-eslint` recommended + `react-hooks` + `react-refresh`
- TypeScript strict mode enabled; no unused vars/params (except `_` prefixed)
- State handling order: Loading → Error → Not Found → Empty Listing → Data (early return)
- No string URLs — all paths in `src/paths.ts` only
- No `Box` spam — use correct semantic components
- No trivial null ignoring (`name ?? ""`, `x ? .. : null`, `x!.y`) — redefine types or add guards
- No unnecessary `useEffect` — effects are for external systems only
- Use WSO2 Oxygen UI components (`@wso2/oxygen-ui`)

**Copyright header (all new files):**
```
// Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
//
// WSO2 Inc. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//  http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.
```

### Commit Message Format

Descriptive, imperative-style commit messages. No strict conventional commits standard enforced, but messages follow clear verb-prefixed patterns:
- `Fix <description>` — bug fix
- `Add <description>` — new feature
- `Remove <description>` — removal
- `Rename <description>` — rename/refactor
- `Move <description>` — restructure
- `Update <description>` — enhancement to existing feature

Examples from history:
- `Fix coderabbit comment`
- `Add registry resource browsing`
- `Remove sample project 2 from init scripts`
- `Move type definitions to type specific files`

### Branch Naming

Feature/fix branches are typically author-specific or descriptive. PRs target the `main` branch.

## Contribution Guidelines [REQUIRED]
<!-- Used by: /send-pr -->

### PR Process

1. **Pre-submit checklist:**
   - `./gradlew build` passes locally
   - `cd frontend && npx prettier --check .` passes
   - Backend tests pass: `cd icp_server && bal test` or Docker Compose test
   - Frontend tests pass: `cd frontend && pnpm test`
   - PR template filled out completely
   - No secrets, passwords, or tokens in committed code
   - Follow WSO2 secure coding standards

2. **Review requirements:**
   - CI must pass (`pr-check.yml`)
   - Code review required before merge
   - CodeRabbit automated review enabled (profile: "chill")

3. **PR template sections (required):** Purpose, Goals, Approach (with screenshots for UI changes), User stories, Release note, Documentation, Automation tests, Security checks.

### Base Branch [OPTIONAL]
<!-- Used by: /code-review, /send-pr -->

`main` — all PRs target the `main` branch.

### PR Template Location [OPTIONAL]

`pull_request_template.md` (repo root)

### Labels & Categories

| Label | When to use |
|-------|-------------|
| Bug fix | Fixes a reported defect |
| Enhancement | Improves existing functionality |
| New feature | Adds new capability |
| UI change | Frontend/visual changes |
| Backend | Backend-only changes |
| Database | Schema or migration changes |
| Security | Security-related fixes or improvements |
| Documentation | Documentation updates |

## CI/CD Pipeline [OPTIONAL]
<!-- Used by: /code-review -->

**CI system:** GitHub Actions

### PR Check (`.github/workflows/pr-check.yml`)

Triggers on pull requests to `main`. Steps:
1. Prettier formatting check on frontend code
2. Full Gradle build (backend + frontend)
3. H2 database initialization test
4. Docker Compose integration tests against MySQL

**Environment:** Node.js 22.19.0 (Prettier) + Node.js 20 (build), JDK 17, Ballerina 2201.13.1, pnpm 8

### Release (`.github/workflows/release.yml`)

Triggers on version tags (`v*.*.*`, `v*.*.*-alpha*`, `v*.*.*-beta*`, `v*.*.*-rc*`) or manual dispatch. Steps:
1. Semantic version validation (SemVer 2.0.0)
2. Full build with version substitution in `gradle.properties`
3. Distribution ZIP verification
4. Trivy security scanning (CRITICAL/HIGH block, results uploaded to GitHub Security)
5. Checksums generation (SHA256, MD5)
6. GitHub Release creation (auto-detects pre-release from version string)
7. Supports dry-run mode (build only, no release)

### Code Review Automation

- **CodeRabbit** (`.github/.coderabbit.yaml`): Automated code reviews with "chill" profile, auto-review on PRs to `main` and `icp2` branches.

## References [OPTIONAL]

| Document | Path | Description |
|----------|------|-------------|
| Architecture Guide | `docs/ARCHITECTURE.md` | Code organization, modules, data flow, file-level breakdown |
| Features Reference | `docs/FEATURES.md` | Product capabilities, API surface, domain model, UI pages |
| Deployment Guide | `docs/DEPLOYMENT.md` | Build, configure, run, deploy (Docker, K8s, standalone) |
| Contributing Guide | `docs/CONTRIBUTING.md` | PR process, coding conventions, testing requirements |
| Frontend House Rules | `frontend/HOUSE_RULES.md` | Mandatory frontend coding conventions |
| Frontend Runtime Config | `frontend/RUNTIME_CONFIG.md` | Runtime config.json loading system |
| RBAC v2 Design | `icp_server/rbac_v2_implementation.md` | RBAC v2 permission model design document |
| Custom Auth Backend | `icp_server/custom_auth/AUTH_BACKEND_IMPLEMENTATION.md` | Pluggable auth backend REST API guide |
| OIDC/SSO Setup | `icp_server/custom_auth/OIDC_SETUP_GUIDE.md` | OIDC provider configuration |
| LDAP Guide | `docs/ldap-user-store.md` | LDAP user store configuration |
| Password Hashing | `docs/password-hashing-configuration.md` | Password hashing algorithm config |
| K8s Deployment | `kubernetes/SETUP.md` | Kubernetes deployment with cert-manager and NGINX Gateway |
| PR Template | `pull_request_template.md` | Pull request template with required sections |
