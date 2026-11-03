# CLAUDE.md

UP-DP, the User Portal's data plane instance: a single-tenant Go BFF that serves a Vite SPA, plus
`ipaas-mock`, which stands in for the cloud. One module, no database. `docs/api.md` is the
contract between the BFF, the SPA, iPaaS-Service and the gateway; change it with any route,
status or wire JSON change.

## Architecture

- **`shared/` is copied from `main`; don't rewrite it.** Fix a bug there on `main` too. The one
  addition is `shared/external-services/ipaas-portal`, which both the BFF's client and the mock
  use, so the portal contract is declared once.
- **`up-dp` and `ipaas-mock` never import each other.**
- **Dependencies point inward**: `api/handlers` → `domain` interfaces → `service` → clients.
- **`config.Load` reads the whole environment once**; `main.go` is lifecycle only. Each service
  loads its own `<service>/.env`.
- **`/api/v1/*` is the API, every other path is the SPA.** An unknown `/api/v1` path is a JSON
  404, never `index.html`.

## Invariants

Each looks like a bug. Don't "fix" it.

- **There is one org and one issuer, both from config.** Nothing in a request names the org or
  chooses the keys that verify a token.
- **The SPA signs in, not the BFF.** It is the WIdP-DP's public client, reads its discovery
  document itself, and keeps the access, refresh and ID tokens as one JSON object in the tab's
  `sessionStorage`. UP-DP has no cookie, session, grant or OIDC call.
- **UP-DP is reachable only through the published environment's gateway.** It reads the token's
  claims without verifying them; never add verification or a route around the gateway.
- **Only `/config.js`, `/api/v1/health`, `/api/v1/auth/scopes` and the SPA answer without a
  token.**
- **The SPA requests the scopes `/api/v1/auth/scopes` lists, never fixed ones.** They change as
  integrations are published, so `/config.js` carries none, and the SPA signs in again with
  `prompt=none` when the list changes. It compares requested scopes, not granted ones.
- **Every iPaaS-Service call names the org and the environment** (`ENVIRONMENT_ID`): the portal
  can be enabled in more than one environment of an org.
- **A client-credentials token is not a user.** ThunderID's `grant_type` claim says which grant
  issued a token, and the gateway's `jwt-auth` admits only `authorization_code` and
  `refresh_token`.
- **The browser calls agents and workflows on the gateway directly**, with its WIdP-DP access
  token. The BFF never proxies them.
- **The catalog is read a page at a time, by cursor, and searched on the server.** It can hold
  thousands of integrations, so nothing lists it whole, except the SPA reading every workflow for
  the task inbox. Each integration names its project (id, name and handle), and the list filters by project id.
- **UP-DP enforces the portal's permissions itself**, from the token's scopes, in the catalog
  service: `aiagent:view`, `automation:view` and `workflow:view` per kind, `automation:trigger`
  to run. Never leave them to the gateway; they will get finer than a gateway policy. A kind the
  caller may not view is left out of lists and not found by id.
- **Catalog reads are cached; runs are not.** The SPA polls executions to follow a run, so they
  always go to iPaaS-Service.
- **UP-DP calls iPaaS-Service as the portal, never as a user.** No end user's identity crosses;
  iPaaS-Service sees only the portal client.
- **Upstream errors classify into `upstream.ErrNotFound` and `upstream.ErrUnavailable`** (see
  `shared/infrastructure/httpclient`). A stale catalog stands in only for `ErrUnavailable`.

## Conventions

- No comment by default; if one is needed, one line, and never a restated invariant.
- Wrap errors with `%w`, prefixed `<component>:<operation>`.
- Use `common.ParseID`/`MustParseID`, not `uuid`, for ids we parse.
