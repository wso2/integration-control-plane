# Contributing Guide

## Development Environment Setup

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Java | 17+ | Required for Gradle |
| Ballerina | 2201.13.1 | [ballerina.io](https://ballerina.io/downloads/) |
| Node.js | 20+ | Required for frontend |
| pnpm | 10+ | `npm install -g pnpm` |
| Docker & Docker Compose | Latest | Required for DB and testing |

### First-Time Setup

```bash
# Clone the repo
git clone <repo-url>
cd integration-control-plane

# Full build (verifies everything works)
./gradlew build

# Start backend with H2 (quickest local setup)
docker-compose -f icp_server/docker-compose.local.yml up --build

# Start frontend dev server (separate terminal)
cd frontend
pnpm install
pnpm dev
```

Backend: `https://localhost:9445` | Frontend: `http://localhost:5173` | Default login: `admin` / `admin`

For full architecture details, see `docs/ARCHITECTURE.md`.

## Coding Conventions

### Backend (Ballerina)

The backend uses **Ballerina 2201.13.1** — NOT Java. All source files are `.bal` files.

**File Organization:**
- One service per top-level `.bal` file, bound to a specific port
- Repository pattern: one `*_repository.bal` per domain entity in `modules/storage/`
- Types: defined in `modules/types/` (not inline)
- Auth checks: use `modules/auth/permission_checker.bal` functions

**Naming:**
- Files: `snake_case.bal`
- Functions: `camelCase`
- Types/Records: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

**Configuration:**
- Use `configurable` keyword in `config.bal` for new settings
- Provide sensible defaults
- Support encrypted values via `$secret{alias}` pattern
- All code outside `config.bal` must use `resolved*` variables for encrypted values

**Error Handling:**
- Use Ballerina's `check` keyword for error propagation
- Use `error` type for domain errors
- Map database errors in `modules/storage/error_mapper.bal`

**Database:**
- Use parameterized queries (prevent SQL injection)
- Add SQL for ALL 4 dialects when modifying schema (MySQL, PostgreSQL, MSSQL, H2)
- Use `database_dialect.bal` for vendor-specific SQL generation

### Frontend (React + TypeScript)

**Mandatory reading:** `frontend/HOUSE_RULES.md`

**Tech Stack:** React 19, TypeScript 5, Vite 7, WSO2 Oxygen UI (MUI-based), React Router v7, TanStack React Query v5.

**Key Rules:**
1. **State handling order:** Always handle Loading → Error → Not Found → Empty Listing → Data. Early return before reaching the main view.
2. **No string URLs:** All URL paths go in `src/paths.ts` only. No string URLs anywhere else.
3. **No Box spam:** Use correct semantic components instead of `Box` wrappers.
4. **No trivial null ignoring:** Don't use `name ?? ""`, `x ? .. : null`, `x!.y`. Redefine types or add guards instead.
5. **No unnecessary useEffect:** Effects are for external systems. If no external system is involved, you don't need an Effect.
6. **Formatting:** Prettier is enforced in CI. Run `npx prettier --check .` before submitting.

**File Organization:**
- Pages: `src/pages/` (one component per route)
- Shared components: `src/components/`
- API calls: `src/api/` (GraphQL queries/mutations, REST calls)
- Routes: `src/config/routes.tsx`
- Path constants: `src/paths.ts`
- Hooks: `src/hooks/`
- Contexts: `src/contexts/`

## Testing

### Backend Tests

Location: `icp_server/tests/`

Test files:
- `auth_tests_v2.bal` — RBAC v2 authorization tests
- `oidc_tests.bal` — OIDC flow tests
- `component_graphql_tests.bal` — Component management tests
- `environment_graphql_tests.bal` — Environment management tests
- `project_graphql_tests.bal` — Project management tests
- `runtime_graphql_tests.bal` — Runtime management tests
- `refresh_token_api_tests.bal` — Refresh token API tests
- `refresh_token_storage_tests.bal` — Token storage tests
- `refresh_token_utils_tests.bal` — Token utility tests
- `token_renew_tests.bal` — Token renewal tests
- `test_utils.bal` — Test utilities and helpers
- `mock_oidc_provider.bal` — Mock OIDC provider for testing

```bash
# Run locally
cd icp_server && bal test

# Run with Docker (matches CI)
docker-compose -f icp_server/docker-compose.test.yml up --build
```

### Frontend Tests

```bash
cd frontend
pnpm test
```

### CI Pipeline (`.github/workflows/pr-check.yml`)

The CI runs on every PR to `main`:
1. Prettier formatting check on frontend code
2. Full Gradle build (backend + frontend)
3. H2 database initialization test
4. Docker Compose integration tests against MySQL

**Environment:** Node.js 22.19.0, JDK 17, Ballerina 2201.13.1

## Pull Request Process

### PR Template

Located at: `pull_request_template.md`

Required sections:
- **Purpose** — Problem description with links to issues (`Resolves #123`)
- **Goals** — What the PR solves
- **Approach** — Implementation description (include screenshots/GIFs for UI changes)
- **User stories** — Addressed user scenarios
- **Release note** — Brief description for release notes
- **Documentation** — Links to doc changes or "N/A" with explanation
- **Automation tests** — Unit test and integration test coverage details
- **Security checks** — WSO2 secure coding standards, FindSecurityBugs, no committed secrets

### Checklist Before Submitting

1. `./gradlew build` passes locally
2. `cd frontend && npx prettier --check .` passes
3. Backend tests pass: `cd icp_server && bal test` or Docker Compose test
4. Frontend tests pass: `cd frontend && pnpm test`
5. PR template filled out completely
6. No secrets, passwords, or tokens in committed code
7. Follow WSO2 secure coding standards

### Review Process

- PRs target the `main` branch
- CI must pass (`pr-check.yml`)
- Code review required before merge

## Database Changes

When modifying the database schema:

1. **Init scripts** — Update ALL 4 dialect files in `icp_server/resources/db/init-scripts/`:
   - `mysql_init.sql`
   - `postgresql_init.sql`
   - `mssql_init.sql`
   - `h2_init.sql`

2. **Credentials DB** (if auth-related) — Update corresponding `credentials_*.sql` files

3. **Migration scripts** — Add migration SQL in `icp_server/resources/db/migration-scripts/` for upgrading existing installations

4. **Repository code** — Update the corresponding `*_repository.bal` in `icp_server/modules/storage/`

5. **Types** — Update type definitions in `icp_server/modules/types/`

## Adding a New Feature

### Backend Checklist

1. Define types in `icp_server/modules/types/types.bal` (or `auth_types.bal` for auth-related)
2. Add repository methods in `icp_server/modules/storage/*_repository.bal`
3. Add GraphQL operations in `icp_server/graphql_api.bal` (or REST in `auth_service.bal`)
4. Add permission checks using `icp_server/modules/auth/permission_checker.bal`
5. Add tests in `icp_server/tests/`
6. Update `icp_server/Config.toml` and `icp_server/config.bal` if new configurables are needed
7. Update DB init scripts for all 4 dialects if schema changes are needed

### Frontend Checklist

1. Add page component in `frontend/src/pages/`
2. Add route in `frontend/src/config/routes.tsx`
3. Add path constant in `frontend/src/paths.ts`
4. Add GraphQL queries/mutations in `frontend/src/api/`
5. Follow `HOUSE_RULES.md` conventions (loading, error, not-found, empty states)
6. Use Oxygen UI components (`@wso2/oxygen-ui`)
7. Run `npx prettier --write .` to format

## License

Apache License 2.0. All new files must include the WSO2 copyright header:

```
// Copyright (c) 2025, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
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
