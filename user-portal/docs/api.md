# UP-DP contracts

Three processes take part locally. The design is at
https://claude.ai/artifact/Sm5CQNxFVUtw5SKLNm7bpi.

| Process | Default address | Plays |
|---|---|---|
| `up-dp` | `:8080` | UP-DP: the Go BFF, which also serves the SPA. Reached only through the gateway |
| `ipaas-mock` | `:9100` | the Platform IdP's token endpoint |
| `ipaas-mock` | `:9090` | iPaaS-Service's portal route group |
| `ipaas-mock` | `:9200` | the published environment's API gateway: UP-DP, agents and workflows |
| ThunderID | set by `OIDC_ISSUER` | the WIdP-DP that signs portal users in |

```
browser ── discovery, auth code + PKCE, refresh ─────────────▶ ThunderID (WIdP-DP)
   └──── WIdP-DP access token ──▶ API gateway (mock) ─┬─ agents, workflows
                                    jwt-auth, token   └─▶ up-dp ── client credentials ──▶ Platform IdP (mock)
                                    passed through          └──── bearer (portal client) ─▶ iPaaS-Service (mock)
```

All bodies are JSON. Errors are `{"error": "..."}` (`shared/web`) with the status code, except on the
gateway's workflow routes, which answer `{"error": {"message": "..."}}` as the workflow
Management API does.

## UP-DP (`up-dp`)

`/api/v1/*` is the API, and `/config.js` is the SPA's config. Every other path serves the SPA: a
file from the build if one matches, otherwise `index.html`, with `Cache-Control: no-cache` and
its `<title>` set to the portal's. An unknown `/api/v1/*` path is a JSON 404, never the SPA.

Only `/config.js`, `GET /api/v1/health`, `GET /api/v1/auth/scopes` and the SPA answer without a
token. What the SPA needs before sign-in, apart from the scopes, is in `GET /config.js`, which
`index.html` loads before the SPA's own script. UP-DP builds it once at startup from its
environment, so it is the same for the whole deployment:

```js
window.__UP_DP_CONFIG__ = <PortalConfig as JSON>;
```

It is `Content-Type: text/javascript; charset=utf-8` and `Cache-Control: no-store`. The JSON
escapes `<`, `>` and `&`, and leaves out empty links and logos.

```ts
interface PortalConfig {
  portalName: string;      // PORTAL_NAME, default "User Portal"
  productName: string;     // PRODUCT_NAME, default "Integration Platform"
  orgHandle: string;       // shown in the header; users never type it
  orgName: string;
  theme: string;           // PORTAL_THEME: an Oxygen UI theme key, see the SPA
  primaryColor?: string;   // PORTAL_PRIMARY_COLOR: overrides the theme's primary, "#RRGGBB"
  links: { terms?: string; privacy?: string; support?: string };
  // PORTAL_LOGO_LIGHT_URL and PORTAL_LOGO_DARK_URL: the header's logo on a light and on a dark
  // background. One set alone fills both; with neither, the SPA shows its bundled wordmark.
  logo: { light?: string; dark?: string };
  auth: {
    issuer: string;     // OIDC_ISSUER
    clientId: string;   // OIDC_CLIENT_ID: a public client
    resource: string;   // OIDC_RESOURCE: the portal's API resource, which every token is for
  };
}
```

`GET /api/v1/auth/scopes` is what the SPA asks for when it signs in. It changes as integrations
are published, so it is not in `/config.js`. It is `Cache-Control: no-store`:

```ts
interface ScopeList {
  // OIDC_SCOPES, offline_access, the portal's own scopes (aiagent:view, automation:view,
  // automation:trigger, workflow:view), then the scopes of the integrations published in
  // ENVIRONMENT_ID, sorted. Each once.
  scopes: string[];
}
```

UP-DP reads the published scopes from iPaaS-Service and keeps them for `SCOPES_CACHE_TTL`
(default 10 minutes). When iPaaS-Service doesn't answer, it serves the last published scopes it
read. Until it has read them once, as after a restart, it answers 503: the portal's own scopes
alone would read as every integration's scope withdrawn, and send every open tab to sign in again.

### Sign-in

UP-DP takes no part. The SPA is the WIdP-DP's public client:

- The SPA reads `${issuer}/.well-known/openid-configuration`, with any terminating `/` of the
  issuer dropped first, once per page and keeps it in memory. `auth.issuer` is `OIDC_ISSUER` as
  set, slash and all. Unless the document's `issuer` equals it byte for byte, sign-in fails as
  `unavailable`, as it does when the document can't be read. The authorize, token, revocation
  and end-session endpoints come from it.
- The redirect URI is `${window.location.origin}/auth/callback` and the post-logout redirect URI
  `${window.location.origin}/`, so a sign-in begins and ends on the origin the browser is on.
- Every sign-in first reads `/api/v1/auth/scopes` and asks for exactly those scopes. If UP-DP
  doesn't answer, the tab asks for the scopes it asked for last, or fails as `unavailable`.
- The authorize, code and refresh requests all send `resource=${auth.resource}` (RFC 8707). The
  WIdP-DP issues a token for one API resource, and without it picks a default one or refuses.
- A tab with no tokens goes to the authorize endpoint with PKCE, `state`, `nonce` and
  `prompt=none`. The WIdP-DP's own session answers without a page; `login_required` (or another
  interaction error) sends the tab again without `prompt`.
- `/auth/callback` is an SPA route. The SPA checks `state` and `iss`, redeems the code at the
  token endpoint, checks the ID token's `nonce`, and returns to the path it started on.
- The access, refresh and ID tokens, with the scopes the tab asked for, are one JSON object in
  the tab's `sessionStorage` (`up-dp:tokens`). A reload keeps them; no other tab sees them, so each tab renews its own
  refresh token and rotation never races.
- The SPA refreshes a minute before the access token expires. A refused refresh drops the tokens
  and signs in again with `prompt=none`.
- On page load and whenever the window gets focus, the SPA reads `/api/v1/auth/scopes` again. If
  the list differs, as a set, from the scopes it asked for, it signs in again with `prompt=none`:
  a refresh can't add scopes. It compares requested scopes, not granted ones, so a scope the
  user's roles don't grant doesn't loop. A failed read waits for the next focus.
- Sign-out tells every tab over a `BroadcastChannel`; each revokes its own refresh token. The tab
  that signed out then goes to the end-session endpoint, which ends the WIdP-DP's session.

### Signed in

Every route below needs `Authorization: Bearer <access_token>`. The gateway in front of UP-DP
has verified it (below); UP-DP only reads its claims, without checking the signature: `sub`
and `exp`, both required, and `scope`. A ThunderID access token carries no username, name, email
or groups; the SPA shows the user from the ID token. A missing or unparseable token, one with
no `sub` and one past its `exp` get 401. UP-DP logs `sub`, never the token, and sends
iPaaS-Service neither.

UP-DP enforces the portal's permissions itself, from the token's `scope`, and doesn't rely on the
gateway for them: the scopes will get finer than a gateway policy can say.

| Scope | Lets the caller |
|---|---|
| `aiagent:view` | list and open AI agents |
| `automation:view` | list and open automations, and read their deployments and runs |
| `workflow:view` | list and open workflows, and so read their tasks |
| `automation:trigger` | run an automation |

A list leaves out the kinds the caller may not view, and asking for one by `kind` gets 403. An
integration of a kind the caller may not view gets 404, as do its deployment and runs, so the
answer doesn't say it exists. A caller who may view no kind gets empty lists.

| Method and path | Answers |
|---|---|
| `GET /api/v1/projects` | `Project[]`: the projects with an integration of a kind the caller may view published, by name, to filter by |
| `GET /api/v1/integrations?kind=&project=&search=&limit=&cursor=` | `IntegrationPage`: the published agents, automations and workflows, a page at a time, see below |
| `GET /api/v1/integrations/{id}` | `Integration`; 404 when it is not published, or the caller may not view its kind |
| `GET /api/v1/integrations/{id}/deployment-tracks/{trackId}/deployment` | `Deployment` |
| `GET /api/v1/integrations/{id}/deployment-tracks/{trackId}/executions?limit=&before=` | `ExecutionPage`. Automations only, with `automation:view`. `limit` is 1 to 100, default 20; a bad one gets 400 |
| `POST /api/v1/integrations/{id}/deployment-tracks/{trackId}/executions` | 202 `Execution`. Body `{"args": [{"name","value"}]}`, see below. Automations only. Needs `automation:trigger`, else 403. A 400 carries the reason in `error` |

The list is in display name order. `kind`, repeated for several, is one of `aiAgent`,
`automation` and `workflow`; without it, the list holds every kind the caller may view;
`project`, repeated for several, keeps the integrations in any of those projects, by id;
`search` matches the display name and the description, ignoring case; `limit` is 1 to 100,
default 20. `search` is at most 100 characters, and `project` at most 100 ids of at most 128
bytes each. `cursor` is a page's `nextCursor`, which names where the next page starts, so a page
stays the same page while integrations are published and unpublished around it. An unknown
`kind`, a bad `limit`, or a `search` or `project` past those bounds gets 400. UP-DP keeps each
page, keyed by its query and cursor, for `CATALOG_CACHE_TTL`, and serves it up to
`CATALOG_STALE_TTL` old while iPaaS-Service can't be reached; it does the same for one
integration, one deployment and the projects. It holds at most 512 reads, and makes room by
dropping those too old to serve, then the oldest.

Trigger arguments name each runtime argument by `name` and carry one value per entry: an argument
with `repeat` comes once per value. A checked boolean is `"true"`; an unchecked boolean and an
empty value are left out. Prefixes and delimiters stay out of the body: iPaaS-Service builds the
command line from each argument's `prefix` and `delimiter`.

```ts
type IntegrationKind = 'aiAgent' | 'automation' | 'workflow';

interface Project {
  id: string;
  name: string;            // shown
  handle: string;          // the project's URL-safe name
}

interface IntegrationPage {
  items: Integration[];
  nextCursor?: string;     // absent on the last page
  totalCount: number;      // every integration matching the query
}

interface Integration {
  id: string;              // the component uid
  name: string;
  displayName: string;
  description: string;
  kind: IntegrationKind;
  project: Project;
  // Latest first. An agent or workflow with no endpoint on any track is left out of the list.
  deploymentTracks: DeploymentTrack[];
}

interface DeploymentTrack {
  id: string;
  branch: string;
  apiVersion?: string;
  latest: boolean;
  // Agents: their chat endpoints. Workflows: their Management API endpoint. Absent for
  // automations, and for a track whose deployment is not active.
  endpoints?: GatewayEndpoint[];
}

interface GatewayEndpoint {
  name: string;
  displayName: string;
  url: string;             // gateway base URL; agents POST `${url}/chat`
}

// What is deployed on a track: what running it takes. A deployment's status is not sent:
// a track that is not active has no endpoints, and an automation on it can't be triggered.
interface Deployment {
  deploymentTrackId: string;
  environmentName: string;
  // A scheduled automation's schedule. Absent when it runs only on demand, and when its
  // deployment is suspended.
  schedule?: { cron: string; timezone: string };
  runtimeArgs?: RuntimeArgument[];   // automations
}

interface RuntimeArgument {
  name: string;
  type: string;            // "string" | "int" | "float" | "decimal" | "boolean"
  prefix?: string;         // e.g. "--"
  displayName?: string;
  description?: string;
  delimiter?: string;
  values?: string[];       // allowed values, whatever the type: radio for three or fewer, else a dropdown
  repeat?: boolean;        // many values
  required?: boolean;
}

interface Execution {
  jobId: string;
  status: 'Running' | 'Succeeded' | 'Failed';
  startTime: string;       // RFC 3339
  completionTime?: string;
  revisionId?: string;
}

interface ExecutionPage { items: Execution[]; nextCursor?: string }  // `before=nextCursor` for older
```

### The gateway in front of UP-DP

UP-DP runs in the published environment, behind that environment's APIP gateway, and only the
gateway can reach it: a network policy outside this repository enforces that. The gateway's
`jwt-auth` policy (v1.3.1) guards every `/api/v1` operation except `/api/v1/health` and
`/api/v1/auth/scopes`:

| Setting | Value |
|---|---|
| Signature, issuer and expiry | checked with the `ThunderKeyManager` key manager |
| `audiences` | the portal's API resource, `OIDC_RESOURCE` |
| `claims.anyOf` | `grant_type` is `authorization_code` or `refresh_token`, so a client-credentials token is refused |
| `forwardToken` | `true` |
| `forwardedTokenHeader` | `Authorization` |
| `forwardTokenStripScheme` | `false` |

So UP-DP receives the caller's `Authorization: Bearer <access_token>` unchanged. Locally, the
mock gateway on `:9200` makes the same checks (see below).

## iPaaS-Service portal routes (`ipaas-mock`, `:9090`)

Base `/user-portal/orgs/{orgUuid}/environments/{envId}`, where `{envId}` is the environment's
UUID: UP-DP's `ENVIRONMENT_ID`. UP-DP's `IPAAS_BASE_URL` is everything before `/orgs`:
iPaaS-Service's public address with `/user-portal`, or `http://localhost:9090/user-portal` for the
mock. The portal can be enabled in more than one environment, and an integration is published
in each separately. Every call needs a bearer token from the Platform IdP (below), issued to the
org's portal client: `client_id` must be exactly `wc-user-portal-{orgUuid}`, and the token's
`ouId` must equal `{orgUuid}`. iPaaS-Service refuses that client on every other route. The token
is not tied to an environment. Only integrations
published in `{envId}` are visible; an unknown `{envId}` gets 404. UP-DP calls as the portal: no
end user's identity is sent.

| Method and path | Answers |
|---|---|
| `GET /scopes` | `{"scopes": string[]}`: the scopes of the integrations published in `{envId}`, each once |
| `GET /projects` | `{"items": Project[]}`: the projects with an integration published in `{envId}` |
| `GET /components?kind=&project=&search=&limit=&cursor=` | `ComponentPage`, with the same query and order as UP-DP's list. A cursor this listing didn't give gets 400 with `error` `"The cursor is not one this listing gave."`; UP-DP tells it from other 400s by that message alone |
| `GET /components/{componentUid}` | `Component` |
| `GET /components/{componentUid}/deployment-tracks/{trackId}/deployment` | `Deployment` |
| `GET /components/{componentUid}/deployment-tracks/{trackId}/executions?limit=&before=` | `ExecutionPage` |
| `POST /components/{componentUid}/deployment-tracks/{trackId}/executions` | 202 `Execution`. Body `{"args": [{"name","value"}]}` |

```ts
interface ComponentPage { items: Component[]; nextCursor?: string; totalCount: number }

// A published integration, as the portal reads it.
interface Component {
  uid: string;
  name: string;
  displayName: string;
  description: string;
  displayType: 'aiAgent' | 'automation' | 'workflow';
  project: Project;
  deploymentTracks: DeploymentTrack[];   // with each active deployment's endpoints, as UP-DP's
}
```

iPaaS-Service puts each track's endpoints in the listing, so UP-DP reads no deployment to build a
page, and leaves out an agent or a workflow with no endpoint, so every page holds only what the
portal shows. `Deployment`, `Execution` and `ExecutionPage` are the same shapes UP-DP passes on.
iPaaS-Service sends no deployment status; it refuses a trigger on a track that is not active with
a 400.

The mock's environments are `production`, `d4409876-6a7a-56bc-a3c6-ced5a83c922b`, whose gateway
is the mock gateway, and `development`, `fdec6436-38d5-5f7a-8ce8-64ca39048401`. Mock only, and
without a token, these stand in for publishing and unpublishing in the console:

| Method and path | Does |
|---|---|
| `PUT /mock/environments/{envId}/published/{componentUid}` | 204, publishes it in `{envId}` |
| `DELETE /mock/environments/{envId}/published/{componentUid}` | 204, unpublishes it from `{envId}` |

## Platform IdP (`ipaas-mock`, `:9100`)

| Method and path | Answers |
|---|---|
| `POST /oauth2/token` | `grant_type=client_credentials`, client authenticated with HTTP Basic. Answers `{"access_token","token_type":"Bearer","expires_in"}` |
| `GET /oauth2/jwks` | the signing keys |

The access token is an RS256 JWT with `iss`, `sub` and `client_id` (the client ID), `aud`
(`ipaas-service`), `exp`, and the org claims `ouId`, `ouHandle` and `ouName`.

## API gateway (`ipaas-mock`, `:9200`)

The browser calls it directly with its WIdP-DP access token. When `GATEWAY_JWKS_URL` is set,
the token's signature, expiry and (with `GATEWAY_ISSUER`) issuer are checked. Otherwise any
bearer token is accepted and only read for `sub`, `username` and `roles` or `groups`.

### UP-DP

Every path that is not an agent's or a workflow's endpoint goes to UP-DP at `UP_DP_UPSTREAM`
(default `http://localhost:8080`), with `Authorization` passed through unchanged. `/config.js`,
`/api/v1/health`, `/api/v1/auth/scopes` and every path outside `/api` need no token. The rest of `/api` gets the
`jwt-auth` checks above: the token as described, an `exp` in the future, an `aud` among
`GATEWAY_AUDIENCES` when that is set, and a `grant_type` of `authorization_code` or
`refresh_token`. It checks no scope: UP-DP does. A bad token gets 401, and an unreachable UP-DP
502.

### Agents and workflows

CORS allows the origins in `GATEWAY_ALLOWED_ORIGINS`.

Endpoint URLs are `{GATEWAY_URL}/{orgHandle}/{project}/{component}/{apiVersion}`.

#### Agent chat

`POST {url}/chat` with `{"sessionId": "...", "message": "..."}` answers `{"message": "..."}`.

#### Workflow Management API

The routes, shapes and spellings of `module-ballerina-workflow`'s management module, as the
old portal's `src/api/workflow.ts` and `src/types/workflow.ts` use them. Pages are
`{"items": [], "nextPageToken": null, "hasMore": false}`, with `limit` and `pageToken` in the
query.

| Method and path | Answers |
|---|---|
| `GET {url}/runtime` | `{"taskQueue": "..."}` |
| `GET {url}/metadata` | `{"metadataVersion", "descriptor": {"workflows": [{"name", "graph"}]}}` |
| `GET {url}/definitions` | `{"definitions": WorkflowDefinition[]}` |
| `GET {url}/workflows?status=&limit=&pageToken=` | page of `WorkflowInstanceSummary`, newest first |
| `POST {url}/workflows` | `{"workflowType", "input"}` answers `{"workflowId", "runId"}` |
| `GET {url}/workflows/{workflowId}/{runId}` | `WorkflowExecutionInfo` |
| `GET {url}/workflows/{workflowId}/{runId}/activity-tree` | `{"nodes": ActivityTreeNode[]}` |
| `POST {url}/workflows/{workflowId}/{runId}/cancel` | `{"success": true}`; 409 once the run has finished |
| `GET {url}/human-tasks?status=&parentWorkflowId=&limit=&pageToken=` | page of `HumanTaskSummary` |
| `GET {url}/human-tasks/{taskId}` | `HumanTaskInfo` |
| `POST {url}/human-tasks/{taskId}/complete` | `{"result": ...}`; 409 unless pending, 403 unless `canComplete` |
| `GET {url}/review-activities?status=&parentWorkflowId=&limit=&pageToken=` | page of `ReviewActivitySummary` |
| `GET {url}/review-activities/{taskId}` | `ReviewActivityInfo` |
| `POST {url}/review-activities/{taskId}/proceed` | no body |
| `POST {url}/review-activities/{taskId}/proceed-with-input` | `{"input": {...}}` |
| `POST {url}/review-activities/{taskId}/reject` | `{"feedback"?: "..."}` |

Runs advance on their own, about one step every few seconds, and wait at a human task or a
review until someone acts on it. A task's `canComplete` is true when the caller holds one of
the task's roles, or when the task names none.
