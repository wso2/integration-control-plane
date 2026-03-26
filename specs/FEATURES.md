# Features Reference

## Product Overview

WSO2 Integration Control Plane (ICP) is a unified management and observability platform for WSO2 integration runtimes. It enables developers and operators to monitor deployment health, manage integration artifacts, control runtime behavior, and troubleshoot issues — all from a single dashboard backed by a GraphQL API.

## Domain Model

### Organizations
- Multi-tenant container (default `org_id = 1` for single-tenant deployments)
- All projects, environments, and secrets are scoped to an organization

### Projects
- Logical grouping of related integrations
- Has a display name, description, and unique handler
- Contains one or more components (integrations)

### Environments
- Deployment targets (e.g., Development, Staging, Production)
- Can be marked as production or non-production (affects RBAC permissions)
- Scoped to an organization

### Components (Integrations)
- Deployable integration units within a project
- Types: Ballerina Integration (BI) or Micro Integrator (MI)
- Each component can have runtimes registered in different environments

### Runtimes
- WSO2 MI or BI runtime instances that connect to ICP via heartbeat
- Track status (RUNNING/OFFLINE), last heartbeat time, node info
- Report their deployed artifacts to ICP
- Authenticated via JWT with key ID (kid) lookup against org secrets

### Artifacts
Integration artifacts deployed on MI runtimes:
- REST APIs
- Proxy Services
- Endpoints
- Inbound Endpoints
- Sequences
- Scheduled Tasks
- Templates
- Message Stores
- Message Processors
- Connectors
- Local Entries
- Data Services
- Data Sources
- Carbon Applications
- Registry Resources

## API Surface

### GraphQL API (Port 9446, `/graphql`)

Source: `icp_server/graphql_api.bal`

#### Project Operations
- `projects(orgId)` — List projects in an organization
- `adminProjects` — List all projects (admin)
- `projectCreationEligibility` — Check if user can create projects
- `projectHandlerAvailability` — Check handler uniqueness
- `createProject(project)` — Create a new project
- `updateProject(project)` — Update project details
- `deleteProject(orgId, projectId)` — Delete a project

#### Environment Operations
- `environments(orgUuid, type, projectId)` — List environments
- `adminEnvironments` — List all environments (admin)
- `createEnvironment(environment)` — Create an environment
- `updateEnvironment(environmentId, name, description)` — Update environment
- `updateEnvironmentProductionStatus` — Toggle production flag
- `deleteEnvironment(environmentId)` — Delete an environment

#### Component Operations
- `components(orgHandler, projectId, options)` — List components
- `component(componentId, projectId, componentHandler)` — Get component detail
- `componentDeployment` — Get deployment info
- `componentArtifactTypes` — List supported artifact types
- `createComponent(component)` — Create a component
- `updateComponent(component)` — Update component
- `deleteComponent(componentId)` — Delete a component

#### Runtime Operations
- `runtimes(status, runtimeType, environmentId, projectId, componentId)` — List runtimes with filters
- `runtime(runtimeId)` — Get specific runtime
- `services(runtimeId)` — Ballerina services on a runtime
- `listeners(runtimeId)` — HTTP listeners on a runtime
- `deleteRuntime(runtimeId, revokeSecret)` — Remove a runtime

#### Artifact Operations (MI-specific)
- `restApisByEnvironmentAndComponent` — List REST APIs
- `proxyServicesByEnvironmentAndComponent` — List proxy services
- `endpointsByEnvironmentAndComponent` — List endpoints
- `inboundEndpointsByEnvironmentAndComponent` — List inbound endpoints
- `sequencesByEnvironmentAndComponent` — List sequences
- `tasksByEnvironmentAndComponent` — List scheduled tasks
- `messageStoresByEnvironmentAndComponent` — List message stores
- `messageProcessorsByEnvironmentAndComponent` — List message processors
- `connectorsByEnvironmentAndComponent` — List connectors
- `dataSourcesByEnvironmentAndComponent` — List data sources
- `servicesByEnvironmentAndComponent` — List services
- `listenersByEnvironmentAndComponent` — List listeners
- `updateArtifactStatus` — Enable/disable an artifact
- `updateArtifactTracingStatus` — Toggle artifact tracing
- `updateArtifactStatisticsStatus` — Toggle artifact statistics
- `triggerArtifact` — Trigger artifact execution

#### Logger Operations
- `loggersByRuntime(runtimeId)` — List loggers for a runtime
- `loggersByEnvironmentAndComponent` — List loggers by env/component
- `updateLogLevel(runtimeId, loggerName, newLevel)` — Change log level
- `updateLoggingProfile` — Update logging profile

#### Log File Operations
- `logFilesByRuntime(runtimeId, searchKey)` — List log files
- `logFileContent(runtimeId, fileName)` — Read log file content

#### User & Access Control Operations
- User CRUD, group management, role management, permission queries
- Organization-scoped and project/component-scoped operations
- Secret management (org secrets, secret bindings)

### REST Auth API (Port 9445, `/auth/*`)

Source: `icp_server/auth_service.bal`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/capabilities` | GET | Supported auth features (create user, change password, etc.) |
| `/auth/login` | POST | User login (returns JWT + refresh token) |
| `/auth/token/refresh` | POST | Refresh access token |
| `/auth/token/introspect` | POST | Validate/introspect a token |
| `/auth/change-password` | POST | User password change |
| `/auth/reset-password` | POST | Admin password reset |
| `/auth/sso/config` | GET | SSO configuration for frontend |
| `/auth/sso/token` | POST | Exchange OIDC authorization code for JWT |

### Runtime Heartbeat (Port 9445, `/icp/heartbeat`)

Source: `icp_server/runtime_service.bal`

- `POST /icp/heartbeat` — Runtime registration and periodic heartbeat
  - JWT bearer token with `kid` (key ID) for authentication
  - Payload includes: runtime ID, type, status, environment, project, component, artifacts, node info, system info
  - Supports lazy binding (runtimes can register before their project/component exists)

### Observability API (Port 9448, `/icp/observability/*`)

Source: `icp_server/observability_service.bal`

- Log searching and retrieval via OpenSearch
- Registry resource browsing for MI runtimes
- Metrics proxying

### OpenSearch Adapter (Port 9449)

Source: `icp_server/opensearch_adapter_service.bal`

- Translates ICP log queries to OpenSearch queries
- JWT authentication with short expiry (internal service)

## Authentication & Authorization

### Authentication Methods

1. **Built-in User Backend** — Default username/password auth with JWT (HS256)
   - Source: `icp_server/default_user_service.bal`
   - Runs on port 9447

2. **LDAP** — Enterprise directory integration
   - Source: `icp_server/ldap_user_service.bal`
   - Config: `docs/ldap-user-store.md`

3. **OIDC/SSO** — OAuth2 authorization code flow
   - Compatible with: Asgardeo, Okta, Auth0, Azure AD, Keycloak
   - Source: `icp_server/modules/auth/oidc.bal`
   - Config: `icp_server/custom_auth/OIDC_SETUP_GUIDE.md`

4. **Custom Auth Backend** — Pluggable REST API
   - Spec: `icp_server/custom_auth/AUTH_BACKEND_IMPLEMENTATION.md`

### RBAC v2 Authorization

Design doc: `icp_server/rbac_v2_implementation.md`

**Model**: User → Group → Role → Permission

**Permission Scopes** (hierarchical):
- Organization level
- Project level
- Environment level
- Integration (component) level

**Permission Domains**:
- Integration management (create, view, update, delete components)
- Environment management (production and non-production)
- Project management
- Observability (logs, metrics)
- User management (users, groups, roles)

**Auth Module**: `icp_server/modules/auth/`
- `permission_checker.bal` — Core authorization (`hasPermission`, `hasAnyPermission`, `hasAllPermissions`)
- `context_builder.bal` — Extract user context from HTTP request
- `access_resolver.bal` — Resolve access for a given resource
- `oidc.bal` — OIDC token exchange

## Frontend Pages (UI)

Source: `frontend/src/pages/`

### Authentication
- `Login.tsx` — Login form (username/password + SSO)
- `OIDCCallback.tsx` — OIDC redirect handler
- `ForceChangePassword.tsx` — Mandatory password change

### Project Management
- `Projects.tsx` — Projects listing
- `CreateProject.tsx` — Create new project
- `Project.tsx` — Project detail view

### Environment Management
- `Environments.tsx` — Environments listing
- `CreateEnvironment.tsx` — Create environment
- `EditEnvironment.tsx` — Edit environment

### Component/Integration Management
- `Components.tsx` — Components listing
- `CreateComponent.tsx` — Create component
- `Component.tsx` — Component detail (artifacts, runtimes, deployment info)
- `ComponentEditor.tsx` — Component configuration editor

### Runtime Management
- `OrgRuntimes.tsx` — Organization-wide runtime listing
- `Runtime.tsx` — Individual runtime detail (status, artifacts, node info)

### Observability
- `RuntimeLogs.tsx` — Runtime log viewer
- `ManageLoggers.tsx` — Logger level management
- `Metrics.tsx` — Metrics dashboard
- `Analytics.tsx` — Analytics views

### Access Control (RBAC)
- `AccessControl.tsx` — Access control management
- `CreateGroup.tsx`, `EditGroup.tsx` — Group management
- `ComponentGroupDetail.tsx`, `ProjectGroupDetail.tsx` — Scoped group details
- `CreateRole.tsx`, `RoleDetail.tsx` — Role management
- `ComponentRoleDetail.tsx`, `ProjectRoleDetail.tsx` — Scoped role details
- `CreateUser.tsx`, `EditUser.tsx` — User management
- `Organizations.tsx` — Organization management
- `Profile.tsx` — User profile

### Other
- `Error.tsx` — Error page
- `CookiePolicy.tsx`, `PrivacyPolicy.tsx` — Legal pages

## Scheduled Tasks

- **Runtime Offline Detection** (`icp_server/runtime_offline_scheduler.bal`): Periodically checks for runtimes that have missed heartbeats and marks them offline. Interval: `schedulerIntervalSeconds` (default 600s).

- **Refresh Token Cleanup** (`icp_server/refresh_token_cleanup_scheduler.bal`): Removes expired refresh tokens from the database. Interval: `refreshTokenCleanupIntervalSeconds` (default 86400s).

## Secret Management

- Organization-level secrets stored in `org_secrets` table
- Secrets are bound to components/environments via `secret_bindings` table
- Each secret has a key ID (kid) used for runtime JWT validation
- Cipher utility for encryption/decryption: `icp_server/modules/utils/cipher.bal`
- Encrypted config values use `$secret{alias}` format resolved via `secrets` map in `Config.toml`
