# User Portal on WSO2 Cloud

The data plane half of the User Portal: **UP-DP**, one Go BFF per org that runs behind the
published environment's API gateway, reads the catalog from iPaaS-Service, and serves the React
SPA, which signs portal users in at the environment's WIdP-DP (ThunderID). The design is at
https://claude.ai/artifact/Sm5CQNxFVUtw5SKLNm7bpi.

| Path | What it is |
|---|---|
| `up-dp/` | The BFF. `/api/v1/*` is its API; every other path serves the SPA. |
| `up-dp/web/` | The SPA: Vite, React 19.2.3, Oxygen UI. See its README for themes. |
| `ipaas-mock/` | A stand-in for the cloud: the Platform IdP's token endpoint, iPaaS-Service's portal routes, a proxy in front of UP-DP standing in for kgateway, and an API gateway with sample agents and workflows. |
| `shared/` | Copied unchanged from `main`, plus `external-services/ipaas-portal`, the one declaration of the portal contract. |
| `docs/api.md` | Every route and shape the three processes speak. |

## Run it locally

Each service reads its own env file, so neither picks up the other's settings or the v2
`.env` at the root.

```bash
cp ipaas-mock/.env.example ipaas-mock/.env
```

```bash
cp up-dp/.env.example up-dp/.env
```

Fill in `up-dp/.env`: `OIDC_*` for your ThunderID app (below). Fill in `GATEWAY_*` in
`ipaas-mock/.env` to have the mock gateway verify tokens.

Then, in three terminals:

```bash
make run-mock
```

```bash
make run-up-dp
```

```bash
make web-dev
```

Open http://localhost:5173. Requests go the way they do in the cloud: Vite → mock gateway →
BFF. The Vite dev server proxies `/api` and `/config.js` to the mock gateway (`:9200`), which
checks the token as the published environment's gateway does and passes the request on to the
BFF (`:8080`, `UP_DP_UPSTREAM`). The BFF verifies nothing itself, so don't call it directly. To
try the built SPA as the image serves it, run `make web` and open http://localhost:9200.

## Set up ThunderID

Register the portal app on the published environment's ThunderID:

- A public client: token endpoint auth method `none`, PKCE required. The SPA signs in with it
  and calls ThunderID's token and revocation endpoints itself; UP-DP holds no client secret, key
  or session.
- Grant types: `authorization_code` and `refresh_token`.
- Put `sub`, `name`, `email` and `preferred_username` in the ID token. The SPA shows the user
  from the ID token's claims; UP-DP has no route that returns them.
- For each origin the portal is reached on, the redirect URI `<origin>/auth/callback` and the
  post-logout redirect URI `<origin>/`. The SPA builds both from the origin the browser is on.
  Locally that is `http://localhost:5173/auth/callback`, `http://localhost:5173/` and the same
  two on `http://localhost:9200`.
- Each origin on ThunderID's CORS allow-list, so the browser can read the discovery document and
  call the token and revocation endpoints. Send `PUT /server-config/cors` with
  `{"allowedOrigins": ["http://localhost:5173", "http://localhost:9200"]}`, with an
  administrator's token that has the `system` scope.
- Access tokens must be JWTs whose `aud` is the portal's API resource: set its identifier as
  `OIDC_RESOURCE`, which the SPA sends as `resource`. UP-DP checks the audience.
- Add the portal's own permissions to the portal's API resource and grant them to roles:
  `aiagent:view`, `automation:view` and `workflow:view` to see each kind of integration, and
  `automation:trigger` to run automations. UP-DP checks them itself; without a kind's view
  permission, a user doesn't see that kind at all.
- The SPA also asks for the scopes of the integrations published in `ENVIRONMENT_ID`, which
  `/api/v1/auth/scopes` lists. For one to reach the token, it must be a permission on the
  portal's API resource and granted to the user's role; ThunderID drops the others.
- Workflow tasks are filtered by role, as the workflow engine does, using the `roles` claim of the
  **access token**. The `roles` scope puts roles only in the ID token (the profile menu shows
  those), so also add `roles` to the app's access token user attributes
  (`token.accessToken.userConfig.attributes`). A user without one of a task's roles doesn't see it,
  and a user with no roles can't open run details. The mock's tasks need `finance-approver`,
  `it-admin` or `people-partner`.

Then set `OIDC_ISSUER` to ThunderID's issuer, byte for byte, and `OIDC_CLIENT_ID` to the app's
client ID. A local ThunderID serves a self-signed certificate: open ThunderID once in the browser
to accept it, or the SPA's calls to it fail. Set `OIDC_INSECURE_TLS=true` on UP-DP, which reads
ThunderID's signing keys to verify tokens, and `GATEWAY_INSECURE_TLS=true` on the mock. To have
the mock gateway verify agent and workflow tokens, set `GATEWAY_JWKS_URL` and `GATEWAY_ISSUER`
on the mock.

## Custom domains

A sign-in begins and ends on the origin the browser is on, where the tab keeps its tokens, and
sign-out returns there: the SPA builds its redirect URIs from `window.location.origin`, and
UP-DP needs no setting per origin. ThunderID only sends the browser back to a registered URI, so
register each origin's callback and post-logout URL on the ThunderID app. Allow each origin on
ThunderID's CORS allow-list, and on the API gateway's CORS policy: the browser calls discovery,
the token endpoint, and the agents and workflows, directly.

## The mock

`ipaas-mock` serves one org (`acme`) with:

- Two AI agents. The math tutor solves arithmetic; the HR assistant has two endpoints and two
  tracks.
- Three automations: one manual run with runtime arguments, one on a schedule, and one with two
  tracks, one of them suspended. An argument with the value `fail` makes a run fail.
- Two workflows. Purchase Request waits for Finance approval over 1,000 USD. Employee Lifecycle
  has two definitions, with an IT review before accounts are created. An item or a name
  containing `fail` makes a step fail.

Runs advance about one step every four seconds (`MOCK_STEP_DURATION`). Seeded history leaves two
tasks and one review waiting.

The org has two environments, `production` and `development`, and an integration is published in
each separately: `up-dp/.env.example` names `production`, whose gateway the mock gateway is. Each
integration lists its scopes, which `GET …/environments/{envId}/scopes` returns for the
environment. To publish or unpublish one while the portal is open, see the mock routes in
`docs/api.md`.

## Check

```bash
make lint
```

```bash
make test
```
