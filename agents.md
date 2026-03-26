# agents.md — WSO2 Integration Control Plane (ICP)

## Product Overview

ICP is the management console for WSO2 integration runtimes — it monitors, manages, and observes MI and BI runtime instances. This is a Ballerina + React monorepo with a GraphQL API backend.

**MI (Micro Integrator)** — Java-based runtime. XML artifacts, `deployment.toml`, log4j logging.
**BI (Ballerina Integrator)** — Ballerina-based runtime. logfmt logging.

Both runtimes POST to `/icp/heartbeat` (full) and `/icp/deltaHeartbeat` (hash-only) with a `kid`-based JWT. On first heartbeat an unbound org-secret key is lazily bound to the project+component+environment. The scheduler (`runtime_offline_scheduler.bal`) marks runtimes offline every 600s if no heartbeat is received.

**Control signal flow differs by runtime type:**
- **BI:** Pending commands (`ControlCommand[]`) are returned inside `HeartbeatResponse.commands` — the BI runtime reads them from the heartbeat response and acts on them.
- **MI:** Commands are NOT returned in the response. Instead, `sendPendingMIControlCommands()` calls MI's management API (`/management/*`) directly over HTTP with HMAC-signed JWTs. See `modules/mi_management/` for the full client.

**Test setup:** BI = `sample-integration`, MI = `mi-sample-integration`; project = `sample-project`, env = `dev`.

**Debugging:** Route all traffic through a proxy for wire-dump inspection.

## Specifications and Key Documents

| Document | Path |
|----------|------|
| GraphQL Schema | `icp_server/schema_graphql.graphql` |
| Auth Backend OpenAPI | `icp_server/custom_auth/auth-backend-openapi.yaml` |
| Architecture | `specs/ARCHITECTURE.md` |
| Features | `specs/FEATURES.md` |
| Deployment | `specs/DEPLOYMENT.md` |
| Contributing | `specs/CONTRIBUTING.md` |
| RBAC v2 Design | `icp_server/rbac_v2_implementation.md` |
| Custom Auth Backend | `icp_server/custom_auth/AUTH_BACKEND_IMPLEMENTATION.md` |
| OIDC/SSO Setup | `icp_server/custom_auth/OIDC_SETUP_GUIDE.md` |
| Frontend House Rules | `frontend/HOUSE_RULES.md` |
| Frontend Runtime Config | `frontend/RUNTIME_CONFIG.md` |
| PR Template | `pull_request_template.md` |

## Module Map

| Module | Path | Responsibility |
|--------|------|----------------|
| GraphQL API | `icp_server/graphql_api.bal` | Main data API — CRUD for all domain entities |
| Auth REST API | `icp_server/auth_service.bal` | Login, logout, token refresh, SSO |
| Runtime Heartbeat | `icp_server/runtime_service.bal` | Runtime registration, status, artifact sync |
| Observability API | `icp_server/observability_service.bal` | Log search, registry browsing, metrics proxy |
| OpenSearch Adapter | `icp_server/opensearch_adapter_service.bal` | OpenSearch query translation (port 9449) |
| Default User Backend | `icp_server/default_user_service.bal` | Built-in username/password auth (port 9447) |
| LDAP User Backend | `icp_server/ldap_user_service.bal` | LDAP directory auth (port 9450) |
| Web Server | `icp_server/webserver.bal` | SPA serving, runtime config.json injection |
| Schedulers | `icp_server/runtime_offline_scheduler.bal`, `icp_server/refresh_token_cleanup_scheduler.bal` | Offline detection, token cleanup |
| Storage Module | `icp_server/modules/storage/` | Repository pattern — one `*_repository.bal` per entity |
| Auth Module | `icp_server/modules/auth/` | JWT, RBAC v2 permission evaluation, OIDC |
| Types Module | `icp_server/modules/types/` | Shared domain types |
| MI Management | `icp_server/modules/mi_management/` | HTTP client to MI management APIs |
| Frontend Pages | `frontend/src/pages/` | React page components — one per route |
| Frontend API Layer | `frontend/src/api/` | GraphQL queries/mutations, REST clients |
| Frontend Paths | `frontend/src/paths.ts` | Single source of truth for URL path constants |

## Ports

| Port | Service |
|------|---------|
| 9445 | Main HTTP (Auth REST + SPA + heartbeat) |
| 9446 | GraphQL API (`/graphql`) |
| 9447 | Default auth backend (internal) |
| 9448 | Observability service |
| 9449 | OpenSearch adapter (internal) |
| 9450 | LDAP auth backend (internal) |
| 5173 | Frontend dev server (Vite) |

## Build & Run

```bash
# Full build
./gradlew build

# Backend only
cd icp_server && bal build

# Frontend only
cd frontend && pnpm install && pnpm build

# Run locally with H2
docker-compose -f icp_server/docker-compose.local.yml up --build

# Frontend dev server
cd frontend && pnpm install && pnpm dev

# Backend tests (H2)
cd icp_server && bal test

# Backend tests (MySQL, matches CI)
docker-compose -f icp_server/docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from icp-server-test

# Frontend tests
cd frontend && pnpm test

# Default credentials: admin / admin
```

## Prerequisites

| Tool | Version |
|------|---------|
| Java | 17+ |
| Ballerina | 2201.13.1 |
| Node.js | 20+ |
| pnpm | 10+ |
| Docker & Docker Compose | Latest |

## Coding Guidelines

### Backend (Ballerina)

- **Storage pattern:** Each entity gets its own `*_repository.bal` in `icp_server/modules/storage/`. Repository functions take SQL client as param.
- **Auth:** All GraphQL resolvers and REST endpoints must check RBAC v2 permissions via `icp_server/modules/auth/permission_checker.bal`. Never skip authorization.
- **Types:** Domain types live in `icp_server/modules/types/`. Use existing types; do not duplicate definitions.
- **Config:** All configurable values go through `icp_server/config.bal`. Do not hardcode environment-specific values.
- **MI vs BI differences:** MI management uses direct HTTP calls via `icp_server/modules/mi_management/`. BI control is via heartbeat response in `icp_server/runtime_service.bal`. Understand which runtime you are targeting before making changes.
- **DB support:** Schema changes must include scripts for all four databases: MySQL, PostgreSQL, MSSQL, H2. See `icp_server/resources/db/init-scripts/` and `migration-scripts/`. Credential tables are in separate `credentials_*_init.sql` files.
- **DB dialect:** All raw SQL must use the dialect abstraction in `modules/storage/database_dialect.bal` (boolean literals, LIMIT clauses, timestamp functions differ across databases). Never write DB-specific SQL inline.
- **Error handling:** Repository functions return `error` unions. Use `classifySqlError()` from `modules/storage/error_mapper.bal` to classify DB errors. Never expose raw SQL errors in API responses.
- **Tests:** Backend tests in `icp_server/tests/`. `bal test` runs against H2 locally; CI uses MySQL via `docker-compose.test.yml`.

### Frontend (React/TypeScript)

- **UI library:** Use `@wso2/oxygen-ui` components. Do not introduce other UI component libraries.
- **Routing:** All URL paths are defined in `frontend/src/paths.ts` — single source of truth.
- **API layer:** GraphQL queries/mutations go in `frontend/src/api/`. Use TanStack React Query hooks consistent with existing patterns.
- **Pages:** One page component per route in `frontend/src/pages/`.
- **House rules:** Read `frontend/HOUSE_RULES.md` before making frontend changes.
- **Tests:** Place tests in `__tests__/` directories next to source files. File name: `ComponentName.test.tsx`.

### Git Conventions

- Commit messages: short imperative sentences, no conventional commit prefixes. PRs are squash-merged.
- Follow the PR template in `pull_request_template.md`.

### WSO2-Specific

- Follow [WSO2 REST API Design Guidelines](https://wso2.com/whitepapers/wso2-rest-apis-design-guidelines/) and [WSO2 Secure Coding Guidelines](https://security.docs.wso2.com/en/latest/security-guidelines/secure-engineering-guidelines/secure-coding-guidlines/general-recommendations-for-secure-coding/).
- Never log PII or sensitive runtime data (secrets, tokens, credentials).
- Do not expose internal error details in API responses for 5xx errors.
