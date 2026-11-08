# AGENTS.md — User Portal

UP-DP, the User Portal's data plane instance: a single-tenant Go BFF that serves a Vite SPA, plus
`ipaas-mock`, which stands in for the cloud. One module, no database. `docs/api.md` is the
contract between the BFF, the SPA, iPaaS-Service and the gateway; change it with any route,
status or wire JSON change.

## Commands

Run from `user-portal/`.

| Task                    | Command                                                       |
| ----------------------- | ------------------------------------------------------------- |
| Run locally             | `make run-mock`, `make run-up-dp` and `make web-dev`, each in its own terminal (see `README.md`) |
| Build the Go binaries   | `make build`                                                  |
| Build the SPA           | `make web`                                                    |
| Go tests                | `make test`                                                   |
| Lint                    | `make lint`                                                   |
| Coverage report         | `make cover`                                                  |

The UP-DP image is released only by the `UP-DP Release` workflow
(`.github/workflows/up-dp-release.yml`). It sets `up-dp/VERSION`; never edit that file or push
an image by hand.

## Architecture

- **`shared/` was ported from the earlier User Portal service; keep its shape.** The one
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
- **UP-DP verifies every token itself.** The published environment's kgateway routes the portal's
  host straight to it and checks nothing, so a token's signature (the issuer's discovery
  document names the keys), `iss`, `aud` (`OIDC_RESOURCE`), `client_id` (`OIDC_CLIENT_ID`) and
  `exp` are all UP-DP's to check. `aud` alone doesn't make a token the portal's: any app on the
  WIdP-DP may ask for the portal's resource.
- **Only `/config.js`, `/api/v1/health`, `/api/v1/auth/scopes` and the SPA answer without a
  token.**
- **The SPA requests the scopes `/api/v1/auth/scopes` lists, never fixed ones.** They change as
  integrations are published, so `/config.js` carries none, and the SPA signs in again with
  `prompt=none` when the list changes. It compares requested scopes, not granted ones.
- **Every iPaaS-Service call names the org and the environment** (`ENVIRONMENT_ID`): the portal
  can be enabled in more than one environment of an org.
- **A client-credentials token is not a user.** ThunderID's `grant_type` claim says which grant
  issued a token, and UP-DP admits only `authorization_code`: ThunderID gives a refreshed token
  its original grant's `grant_type`, so `refresh_token` never appears.
- **The browser calls agents and workflows on the gateway directly**, with its WIdP-DP access
  token. The BFF never proxies them.
- **The catalog is read a page at a time, by cursor, and searched on the server.** It can hold
  thousands of integrations, so nothing lists it whole, except the SPA reading every workflow for
  the task inbox. Each integration names its project (id, name and handle), and the list filters by project id.
- **UP-DP enforces the portal's permissions itself**, from the token's scopes, in the catalog
  service: `aiagent:view`, `automation:view` and `workflow:view` per kind, `automation:trigger`
  to run. They will get finer than a gateway policy could say. A kind the
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
