# Deployment Guide

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Java | 17+ | Gradle build system |
| Ballerina | 2201.13.1 | Backend compilation and runtime |
| Node.js | 20+ | Frontend build |
| pnpm | 10+ | Frontend package manager |
| Docker & Docker Compose | Latest | Containerized deployment (recommended) |

## Building from Source

### Full Build (Gradle)

```bash
./gradlew build
# or
./build.sh
```

Output: `build/distribution/wso2-integration-control-plane-<version>.zip`

### Backend Only

```bash
cd icp_server
bal build
```

### Frontend Only

```bash
cd frontend
pnpm install
pnpm build
```

Output: `frontend/dist/`

## Running Locally

### Backend with Ballerina

1. Configure database in `icp_server/Config.toml`
2. Start the server:

```bash
cd icp_server
bal run
```

### Frontend Dev Server

1. Configure backend URLs in `frontend/public/config.json`:

```json
{
  "VITE_GRAPHQL_URL": "https://localhost:9446/graphql",
  "VITE_AUTH_BASE_URL": "https://localhost:9445/auth",
  "VITE_OBSERVABILITY_URL": "https://localhost:9448/icp/observability"
}
```

2. Start the dev server:

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend available at: `http://localhost:5173`

### Port Reference

| Port | Service | Path |
|------|---------|------|
| 9445 | Main HTTP (Auth REST API + SPA serving) | `/auth/*`, `/icp/heartbeat`, `/` |
| 9446 | GraphQL API | `/graphql` |
| 9447 | Auth backend service (internal) | — |
| 9448 | Observability service | `/icp/observability/*` |
| 9449 | OpenSearch adapter (internal) | — |
| 5173 | Frontend dev server (Vite) | `/` |

Default credentials: `admin` / `admin`

## Running with Docker Compose

All compose files are in `icp_server/`:

| File | Database | Use Case |
|------|----------|----------|
| `docker-compose.local.yml` | H2 (in-memory) | Quick local dev |
| `docker-compose.mysql.yml` | MySQL | Standard development |
| `docker-compose.postgresql.yml` | PostgreSQL | PostgreSQL development |
| `docker-compose.mssql.yml` | MSSQL | SQL Server development |
| `docker-compose.observability.yml` | MySQL + OpenSearch + Prometheus + Grafana | Full observability stack |
| `docker-compose.test.yml` | MySQL | Automated test execution |

```bash
# Example: MySQL
docker-compose -f icp_server/docker-compose.mysql.yml up --build

# Example: Full observability stack
docker-compose -f icp_server/docker-compose.observability.yml up --build

# Example: Run tests
docker-compose -f icp_server/docker-compose.test.yml up --build
```

## Database Configuration

Configuration file: `icp_server/Config.toml`

### MySQL

```toml
[icp_server.storage]
dbType = "mysql"
host = "localhost"
port = 3306
name = "icp_db"
username = "root"
password = "root"
```

### PostgreSQL

```toml
[icp_server.storage]
dbType = "postgresql"
host = "localhost"
port = 5432
name = "icp_db"
username = "postgres"
password = "postgres"
```

### Microsoft SQL Server

```toml
[icp_server.storage]
dbType = "mssql"
host = "localhost"
port = 1433
name = "icp_db"
username = "SA"
password = "YourStrong@Passw0rd"
```

### H2 (In-Memory)

```toml
[icp_server.storage]
dbType = "h2"
```

### Database Initialization Scripts

Located in `icp_server/resources/db/init-scripts/`:

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

Migration scripts: `icp_server/resources/db/migration-scripts/`

## Authentication Configuration

### Built-in User Backend (Default)

Runs on port 9447. Configured via `icp_server/Config.toml`:

```toml
# JWT for frontend-server communication
frontendJwtHMACSecret = "default-secret-key-at-least-32-characters-long-for-hs256"
frontendJwtIssuer = "icp-frontend-jwt-issuer"
frontendJwtAudience = "icp-server"
defaultTokenExpiryTime = 3600    # 1 hour (seconds)

# Refresh tokens
refreshTokenExpiryTime = 86400   # 1 day (seconds)
enableRefreshTokenRotation = true
maxRefreshTokensPerUser = 10     # 0 = unlimited

# Auth backend URL
authBackendUrl = "https://localhost:9447"
```

### LDAP

See `docs/ldap-user-store.md` for configuration.

### OIDC/SSO

```toml
ssoEnabled = true
ssoIssuer = ""
ssoAuthorizationEndpoint = ""
ssoTokenEndpoint = ""
ssoLogoutEndpoint = ""
ssoClientId = ""
ssoClientSecret = ""
ssoRedirectUri = ""
ssoUsernameClaim = "email"  # or "preferred_username"
ssoScopes = ["openid", "email", "profile"]
```

See `icp_server/custom_auth/OIDC_SETUP_GUIDE.md` for provider-specific setup.

### Custom Auth Backend

See `icp_server/custom_auth/AUTH_BACKEND_IMPLEMENTATION.md` for implementing a pluggable auth backend.

### Password Hashing

See `docs/password-hashing-configuration.md` for algorithm configuration.

## TLS/Security Configuration

Keystore and truststore files are in `conf/security/`:

```toml
keystorePath = "../conf/security/wso2carbon.jks"
keystorePassword = "wso2carbon"
truststorePath = "../conf/security/client-truststore.jks"
truststorePassword = "wso2carbon"
```

Passwords can be encrypted using the WSO2 cipher tool. Encrypted values use the format `$secret{alias}` in `Config.toml` and are resolved via the `secrets` map:

```toml
[secrets]
alias = "encrypted-value"
```

### Self-Signed Certificates

For local development with self-signed certs:

```toml
artifactsApiAllowInsecureTLS = true
```

Set to `false` in production with a proper truststore.

## Running the Distribution (Standalone)

After building:

```bash
# Extract
unzip build/distribution/wso2-integration-control-plane-<version>.zip -d build/distribution

# Start
cd build/distribution/wso2-integration-control-plane-<version>/bin
./icp.sh     # Linux/macOS
icp.bat      # Windows
```

Distribution contents:
- `bin/icp-server.jar` — Executable JAR
- `bin/icp.sh`, `bin/icp.bat` — Startup scripts
- `conf/deployment.toml` — Configuration
- `conf/security/` — TLS certificates
- `www/` — Frontend static assets
- `dbscripts/` — Database initialization scripts
- `lib/` — Cipher tool dependencies

## Kubernetes Deployment

See `kubernetes/SETUP.md` for full guide.

Components:
- `kubernetes/deployment.yaml` — Pod deployment
- `kubernetes/service.yaml` — Service exposure
- `kubernetes/gateway.yaml` — NGINX Gateway Fabric routing
- `kubernetes/route.yaml` — HTTP route definition
- `kubernetes/issuer.yaml` — cert-manager issuer
- `kubernetes/cert.yaml` — TLS certificate
- `kubernetes/backend-tls-policy.yaml` — Backend TLS policy

Requirements: Kubernetes 1.25+, cert-manager, NGINX Gateway Fabric.

## Observability Stack

The full observability setup includes:

- **OpenSearch** — Log aggregation and full-text search
- **Prometheus** — Metrics collection
- **Grafana** — Visualization dashboards
- **Fluent Bit** — Log shipping from MI runtimes

```bash
docker-compose -f icp_server/docker-compose.observability.yml up
```

OpenSearch configuration in `Config.toml`:

```toml
opensearchUrl = "https://localhost:9200"
opensearchUsername = "admin"
opensearchPassword = "Ballerina@123"
observabilityBackendURL = "https://localhost:9449"
```

## Operational Configuration

```toml
# Runtime health check interval (seconds)
schedulerIntervalSeconds = 600

# Expired refresh token cleanup interval (seconds)
refreshTokenCleanupIntervalSeconds = 86400

# Logging
logLevel = "INFO"           # DEBUG, INFO, WARN, ERROR
enableAuditLogging = true
enableMetrics = true
```
