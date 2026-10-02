# wip API Implementation

> [!IMPORTANT]
> This directory is the **wip** (Choreo v2) real implementation of the API layer. It contains all backend communication logic for this product, structured in three tiers:

```text
authenticatedFetch          (auth/wip/tokenManager.ts)
        ↓
createHttpClient / gql()    (httpClients.ts / graphql.ts)
        ↓
Named service clients       (httpClients.ts exports)
        ↓
Domain files                (alerts.ts, builds.ts, components.ts, …)
```

---

## Tier 1 — Auth transport

`authenticatedFetch` in `auth/wip/tokenManager.ts` is the single point responsible for injecting access tokens, detecting expiry, refreshing, and retrying on 401. **Domain files must not call `authenticatedFetch` directly** except in the documented special cases below.

---

## Tier 2 — Protocol wrappers

| File             | Protocol  | Endpoint                       |
| ---------------- | --------- | ------------------------------ |
| `graphql.ts`     | GraphQL   | `window.API_CONFIG.graphqlUrl` |
| `httpClients.ts` | REST/JSON | configurable per client        |

`createHttpClient(getBaseUrl)` is the REST factory. It handles JSON serialisation, `Content-Type` headers, error throwing on non-2xx, and response parsing. The optional third parameter on `post/put/delete` accepts custom headers (e.g. `application/x-www-form-urlencoded`).

---

## Tier 3 — Named service clients

All defined in `httpClients.ts`. Import the relevant client in domain files — never construct base URLs manually.

| Client                       | Backend service                                       | Base URL source                 |
| ---------------------------- | ----------------------------------------------------- | ------------------------------- |
| `authClient`                 | Auth service — users, roles, groups                   | `authBaseUrl`                   |
| `systemClient`               | System APIs — task logs, build logs                   | `systemApisBaseUrl`             |
| `apimClient`                 | APIM Publisher                                        | `apimBaseUrl`                   |
| `obsClient`                  | Observability — metrics, runtime logs                 | `observabilityUrl`              |
| `choreoClient`               | Choreo Platform API (all `choreoBaseApiUrl` services) | `choreoBaseApiUrl`              |
| `subscriptionsClient`        | Subscriptions service                                 | `subscriptionsApiUrl`           |
| `insightsClient`             | Choreo Insights                                       | `insightsBaseUrl`               |
| `copilotDatacollectorClient` | AI Copilot data collector                             | `aiCopilotDatacollectorBaseUrl` |

## Tier 3 — 403 retry helpers

Also exported from `httpClients.ts`. Use these instead of calling `authenticatedFetch` directly:

| Helper               | When to use                                                                         |
| -------------------- | ----------------------------------------------------------------------------------- |
| `withStsRetry(fn)`   | Token is unscoped (no org UUID in token); STS configured. Refreshes + retries once. |
| `withScopeRetry(fn)` | APIM scope validation error (code 900910). Refreshes + retries once.                |

---

## Known deviations

Only one domain file calls `authenticatedFetch` directly. All other 403 retry cases use the helpers above.

| Location                            | Reason                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `copilot.ts` — `getAiCopilotAnswer` | Caller-provided URL, streaming `Response`, and custom per-request headers — incompatible with `createHttpClient` |

`graphql.ts` and `httpClients.ts` call `authenticatedFetch` internally — expected, as they are the transport layer.

---

## Product context

This directory (`wip/`) is the real implementation for `PRODUCT=wip`. The sibling directories `cloud/` and `icp/` contain stub implementations that throw `not implemented` until they are built out.

`graphql.ts` and `httpClients.ts` are **internal** to this directory — they are the transport infrastructure specific to this product's backend. Other products bring their own transport.

TypeScript always type-checks against this directory (via `tsconfig.app.json` paths) so the IDE is always happy regardless of which product is being built. See `AGENTS.md` in `src/api/wip/` for step-by-step instructions on adding a new function to this implementation.
