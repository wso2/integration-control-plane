# Architecture Guide

## System Architecture Overview

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

In production, the frontend SPA is served by the backend's `webserver.bal` on port 9445 (no separate frontend server).

## Backend Architecture (`icp_server/`)

The backend is written entirely in **Ballerina** (not Java). Each top-level `.bal` file is a Ballerina service bound to a specific port/path.

### Entry Point and Initialization

| File | Purpose |
|------|---------|
| `main.bal` | Application entry point, LDAP user store service initialization |
| `init.bal` | Database initialization, listener setup, configuration loading |
| `config.bal` | All `configurable` parameters with defaults, secret resolution |
| `webserver.bal` | Static SPA file serving (serves `www/` directory), updates `config.json` at startup |

### Service Layer (Top-Level `.bal` Files)

| File | Port | Path | Responsibility |
|------|------|------|----------------|
| `graphql_api.bal` | 9446 | `/graphql` | Main data API — all CRUD for projects, environments, components, runtimes, artifacts, users, groups, roles, permissions, secrets, loggers (~3700 lines) |
| `auth_service.bal` | 9445 | `/auth/*` | Authentication REST API — login, logout, token refresh, SSO, user management, capabilities (~3000 lines) |
| `runtime_service.bal` | 9445 | `/icp/heartbeat` | Runtime heartbeat processing — registration, status updates, artifact sync, lazy component binding |
| `observability_service.bal` | 9448 | `/icp/observability/*` | Observability proxying — log search, registry browsing, metrics |
| `opensearch_adapter_service.bal` | 9449 | — | OpenSearch query translation, JWT-authenticated internal service |
| `default_user_service.bal` | 9447 | — | Built-in user authentication backend (password validation, user CRUD) |
| `ldap_user_service.bal` | 9450 | — | LDAP directory authentication adapter |

### Schedulers

| File | Purpose | Default Interval |
|------|---------|-----------------|
| `runtime_offline_scheduler.bal` | Mark stale runtimes as OFFLINE | 600s (`schedulerIntervalSeconds`) |
| `refresh_token_cleanup_scheduler.bal` | Remove expired refresh tokens | 86400s (`refreshTokenCleanupIntervalSeconds`) |

### Module Layer (`icp_server/modules/`)

#### `storage/` — Database Access Layer (Repository Pattern)

| File | Domain Entity |
|------|---------------|
| `connection_manager.bal` | Database connection pooling and management |
| `database_dialect.bal` | SQL dialect abstraction (MySQL, PostgreSQL, MSSQL, H2) |
| `config.bal` | Storage-specific configuration (DB connection params) |
| `init.bal` | Module initialization, schema setup |
| `repository_common.bal` | Shared query helpers and utilities |
| `error_mapper.bal` | SQL error translation to application errors |
| `project_repository.bal` | Project CRUD operations |
| `environment_repository.bal` | Environment CRUD operations |
| `component_repository.bal` | Component/integration CRUD operations |
| `runtime_repository.bal` | Runtime registration and lifecycle |
| `artifact_repository.bal` | Artifact metadata storage |
| `heartbeat_repository.bal` | Runtime heartbeat tracking |
| `user_repository.bal` | User data persistence |
| `auth_repository.bal` | User/group/role management (RBAC) |
| `auth_token_repository.bal` | Token lifecycle management (refresh tokens) |
| `secret_repository.bal` | Organization secrets and bindings |

#### `auth/` — Authentication & Authorization

| File | Purpose |
|------|---------|
| `context_builder.bal` | Extract user identity and permissions from HTTP request JWT |
| `permission_checker.bal` | RBAC v2 permission evaluation (`hasPermission`, `hasAnyPermission`, `hasAllPermissions`) |
| `access_resolver.bal` | Resolve user access level for a given resource (org/project/env/component scope) |
| `oidc.bal` | OIDC authorization code exchange, token validation |
| `utils.bal` | Authentication utility functions |

#### `types/` — Shared Type Definitions

| File | Contents |
|------|----------|
| `types.bal` | Core domain types (Project, Environment, Component, Runtime, Artifact, etc.) |
| `auth_types.bal` | Authentication types (User, Group, Role, Permission, SSOConfig, etc.) |
| `mi_management_types.bal` | MI runtime management API response types |

#### `utils/` — Utilities

| File | Purpose |
|------|---------|
| `cipher.bal` | Secret encryption/decryption using WSO2 cipher tool |
| `utils.bal` | General utility functions |

#### `mi_management/` — MI Runtime Management Client

| File | Purpose |
|------|---------|
| `mi_management.bal` | HTTP client to call MI runtime management APIs (fetch/enable/disable artifacts, loggers) |
| `mi_types.bal` | MI-specific request/response types |

#### `observability/` — Observability Specifications

| File | Purpose |
|------|---------|
| `spec.bal` | OpenSearch index schema and field definitions |

### Database Layer

#### Tables (Main Database)

**Organizational Structure:**
- `organizations` — Organization records
- `projects` — Projects with handler, description, git config
- `components` — Integration components (BI/MI type)
- `environments` — Deployment environments with production flag

**Runtime Management:**
- `runtimes` — Registered runtime instances with heartbeat tracking
- `artifacts` — MI artifacts metadata
- `artifact_states` — Artifact enable/disable state
- `artifact_tracing` — Artifact tracing configuration
- `artifact_statistics` — Statistics collection state
- `log_levels` — Logger configurations per runtime
- `loggers` — Logger metadata

**User & Access Control (RBAC v2):**
- `users` — User accounts
- `user_groups` — User-group memberships
- `groups` — Authorization groups
- `roles_v2` — Role definitions with permission sets
- `permissions` — Fine-grained permissions
- `group_role_mapping` — Group-role assignments with scope
- `role_permission_mapping` — Role-permission mappings

**Tokens & Secrets:**
- `refresh_tokens` — Session tokens with revocation tracking
- `org_secrets` — Organization-scoped secrets with key IDs
- `secret_bindings` — Secret-component/environment bindings

#### Credentials Database (Separate)
- `users` — User credentials (stored separately for security)
- `user_roles` — Role assignments (legacy RBAC)

#### Schema Files

- Init scripts: `icp_server/resources/db/init-scripts/` (separate files per DB vendor)
- Migration scripts: `icp_server/resources/db/migration-scripts/`

### Configuration System

All configurables are defined in `icp_server/config.bal` using Ballerina's `configurable` keyword. Values are read from `icp_server/Config.toml` at startup.

Pattern:
```ballerina
configurable int serverPort = 9445;  // default value
configurable string frontendJwtHMACSecret = "...";
```

Encrypted values use `$secret{alias}` and are resolved via:
```ballerina
final string resolvedKeystorePassword = check resolveSecret(keystorePassword);
```

## Frontend Architecture (`frontend/`)

### Entry Point

- `src/main.tsx` — React root, provider setup (QueryClient, Theme, Auth)
- `src/App.tsx` — Top-level routing and layout wrapper

### Directory Structure

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `src/pages/` | Page components (one per route) | 35 `.tsx` files |
| `src/components/` | Shared/reusable components | 20 `.tsx` files |
| `src/api/` | Backend API client layer | `graphql.ts`, `queries.ts`, `mutations.ts`, `auth.ts`, `authQueries.ts`, `logs.ts`, `metrics.ts`, `miUsers.ts`, `artifactToggleMutations.ts` |
| `src/config/` | Route definitions and API URLs | `routes.tsx`, `api.ts`, `statusColors.ts` |
| `src/auth/` | Frontend auth state management | Auth context and hooks |
| `src/layouts/` | Page layout wrappers | Sidebar, header, navigation |
| `src/hooks/` | Custom React hooks | Shared logic extraction |
| `src/contexts/` | React context providers | Theme, auth, notification |
| `src/constants/` | Shared constants | Enums, labels |
| `src/utils/` | Utility functions | Formatters, validators |
| `src/paths.ts` | All URL path constants | Single source of truth for URLs |

### Routing

Routes are defined in `src/config/routes.tsx` using React Router v7. All URL path strings are centralized in `src/paths.ts` — no string URLs anywhere else in the codebase.

### API Layer

- `src/api/graphql.ts` — GraphQL client setup
- `src/api/queries.ts` — GraphQL query definitions
- `src/api/mutations.ts` — GraphQL mutation definitions
- `src/api/auth.ts` — REST auth API calls (login, refresh, SSO)
- `src/api/authQueries.ts` — Auth-related GraphQL queries
- `src/api/logs.ts` — Observability API calls
- `src/api/metrics.ts` — Metrics API calls
- `src/api/miUsers.ts` — MI user management
- `src/api/artifactToggleMutations.ts` — Artifact enable/disable mutations

Data fetching uses `@tanstack/react-query` for caching and state management.

### UI Component Library

WSO2 Oxygen UI (`@wso2/oxygen-ui`) — a Material Design-based component library. Icons from `@wso2/oxygen-ui-icons-react`. Charts from `@wso2/oxygen-ui-charts-react`.

### Runtime Configuration

The frontend loads backend URLs from `public/config.json` at runtime (no rebuild needed). See `frontend/RUNTIME_CONFIG.md`. The backend's `webserver.bal` updates this file on startup with configured backend URLs.

## Build System

### Gradle (Project Level)

`build.gradle` orchestrates the full build:
1. Frontend build (`pnpm install` + `pnpm build`)
2. Backend build (`bal build` in `icp_server/`)
3. Distribution packaging (ZIP creation)

Key tasks: `build`, `buildICP`, `buildFrontend`, `packageICP`, `initH2Database`, `initH2CredentialsDatabase`

### Backend Build

```bash
cd icp_server && bal build
```

Produces a JAR in `icp_server/target/bin/`.

### Frontend Build

```bash
cd frontend && pnpm install && pnpm build
```

Produces static assets in `frontend/dist/`.

### Distribution Packaging

The Gradle build creates `build/distribution/wso2-integration-control-plane-<version>.zip` containing the backend JAR, frontend dist, configuration templates, startup scripts, and DB scripts.

Scripts in `distribution/` handle assembly.

## CI/CD

### PR Check (`.github/workflows/pr-check.yml`)

Triggers on pull requests to `main`. Steps:
1. Prettier formatting check on frontend
2. Full Gradle build (includes backend + frontend)
3. H2 database initialization
4. Docker Compose test execution (`docker-compose.test.yml`)

Environment: Node.js 22.19.0, JDK 17, Ballerina 2201.13.1

### Release (`.github/workflows/release.yml`)

Triggers on version tags (`v*.*.*`) or manual dispatch. Steps:
1. Semantic version validation
2. Full build
3. Docker image building (multi-platform)
4. GitHub release creation with distribution artifacts
