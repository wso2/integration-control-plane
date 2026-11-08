# Runtime Configuration

The console reads its backend URLs from `/config.json` when it starts, so one build runs in every environment.

## How it works

1. `src/config/runtimeConfig.ts` fetches `/config.json` before the app renders and maps it onto `window.API_CONFIG`.
2. Each key overrides its default in `DEFAULT_CONFIG` on its own. A key that is missing keeps its default.
3. If `config.json` fails to load, the app boots on the defaults and logs `Failed to load runtime config, using defaults`. The defaults are placeholders, not a working environment.

`public/config.json` is copied to `dist/config.json` on build. Each deployment mounts its own file over it. In wso2cloud-deployment that is the `config.json` in the ipaas-console `ReleaseBinding`.

## Running `pnpm dev`

`public/config.json` runs the console in gateway sign-in mode (see below): every API and session call goes to same-origin `/_auth` and `/_api`. The dev server, on `https://localhost:3000`, proxies those paths to a deployed console's gateway, by default the dev environment's (`https://cloud-console-development.gateway.dev.cloud.wso2.com`). Set `DEV_PROXY_TARGET` to use another one.

The proxy forwards the browser's cookies, so it needs that console's session:

1. Sign in to the deployed console.
2. Copy its `__Host-X-CLOUD` and `__Host-X-INTEGRATION` cookies to `https://localhost:3000`. They are `__Host-` cookies, which a browser keeps only on https, so the dev server keeps serving https.
3. Run `pnpm dev` and open `https://localhost:3000`.

A sign-in started from the dev server completes on the deployed console, whose redirect URI the IdP accepts, so when the session expires, copy the cookies again. The dev server changes the deployed environment's data like the deployed console does. Logs and metrics go to the dev environment's observability proxy, as from the deployed dev console; an empty `VITE_OBSERVABILITY_URL` would fall back to the placeholder default. `pnpm preview` has no proxy.

## Keys

Some key names come from earlier products (`CHOREO_*`, `ASGARDEO_*`, `VITE_*`). They stay as they are because the deployments set them.

| Key                                                                          | Used for                                                                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CHOREO_BASE_API_URL`                                                        | ipaas-service (BFF) base URL. Every console API call goes through it.                                                    |
| `VITE_AUTH_BASE_URL`                                                         | Thunder base URL. The SDK reads `<base>/.well-known/openid-configuration`.                                               |
| `ASGARDEO_CLIENT_ID`                                                         | Thunder OAuth client ID (`IPAAS_CONSOLE`)                                                                                |
| `ASGARDEO_SCOPE`                                                             | Requested scopes                                                                                                         |
| `ASGARDEO_RESOURCE`                                                          | `resource` on the authorize request only, never on the token request                                                     |
| `ASGARDEO_SIGN_IN_REDIRECT_URL`                                              | Redirect URI. Defaults to `<console origin>/signin`.                                                                     |
| `AUTH_BFF_CONTEXT`                                                           | Gateway sign-in context for this console, e.g. `/_auth/integration`. Set, sign-in runs on the gateway (see below).        |
| `AUTH_BFF_SIGN_IN_URL`                                                       | Where gateway sign-in starts. Defaults to `<AUTH_BFF_CONTEXT>/signin`.                                                   |
| `AUTH_BFF_PROXY_CONTEXT`                                                     | The gateway's API root that each product's session proxy sits under. Defaults to `/_api`.                                |
| `VITE_OBSERVABILITY_URL`                                                     | Observability proxy (logs and metrics)                                                                                   |
| `SYSTEM_APIS_BASE_URL`, `SYS_API_PREFIX`                                     | System APIs gateway (component logs, usage insights)                                                                     |
| `BILLING_API_BASE_URL`                                                       | Billing user API. Loading the billing org activates the org's subscription.                                              |
| `ENABLE_BILLING_FEATURE`, `BILLING_CONSOLE_URL`, `CHOREO_SAAS_OFFER_URL`     | Upgrade button and billing links                                                                                         |
| `CLOUD_CONSOLE_URL`                                                          | WSO2 Cloud console origin for billing links and the switcher's Manage row. Unset, the console's own origin. |
| `AGENT_MANAGER_URL`, `API_PLATFORM_URL`, `INTEGRATION_PLATFORM_URL`, `IDENTITY_PLATFORM_URL` | The platform consoles in the header's platform switcher, as the Agent Platform console names them. A platform with no URL is left out; `INTEGRATION_PLATFORM_URL` defaults to this console. |
| `COMING_SOON_PLATFORMS`                                                      | Comma-separated platform ids the platform switcher shows as coming soon, e.g. `agent-manager`. |
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_AUTH_REDIRECTION_URL` | GitHub App authorization and installation. GitHub is off without the client ID.                                          |
| `AZURE_DEVOPS_CLIENT_ID`                                                     | Entra application client ID for Azure DevOps repository access. Azure DevOps is hidden when this is empty.               |
| `EDITOR_CALLBACK_ORIGINS`, `EDITOR_CALLBACK_DOMAINS`                         | Comma-separated https origins and parent domains an editor's sign-in or GitHub result may be sent to. Empty allows none. |
| `CHOREO_URL_MANAGER_URL`, `ENABLE_CUSTOM_URL_MAPPINGS_FEATURE`               | URL settings for an integration. Both are needed.                                                                        |
| `SAMPLES_URL`, `PREBUILT_INTEGRATIONS_URL`                                   | Sample and prebuilt integration catalogs. Both default to GitHub raw.                                                    |
| `RAG_INGESTION_IMAGE`                                                        | Image the unported RAG ingestion wizard deploys; knowledge bases use the images the BFF is configured with               |
| `INTEGRATION_BUILDER_*`                                                      | AI Integration Builder: copilot base URL, model, max tokens, connectors GraphQL URL                                      |
| `AI_COPILOT_URL_SUFFIX`                                                      | Copilot path on the system APIs gateway                                                                                  |
| `MOESIF_APP_URL`                                                             | API Insights. See below.                                                                                                 |
| `TRACKING_ENV`                                                               | Analytics tier: `dev`, `stage`, `prod` or `off`. Picks the GTM container and CookiePro script. Defaults to `dev`.        |
| `MOESIF_APP_API_KEY`                                                         | Moesif app key for product-usage events, set per deployment. Not API Insights. Unset disables Moesif tracking.           |
| `SCOPES_ENFORCED`                                                            | `true` hides what the user's role doesn't allow. Set with ipaas-service's `SCOPES_ENFORCED`.                             |

Sign-out returns to the page origin. Thunder must list that origin in the client's `postLogoutRedirectUris`.

## Sign-in on the gateway (BFF)

With `AUTH_BFF_CONTEXT` set, the WSO2 API Platform gateway signs the user in and holds the tokens; the browser holds only an HttpOnly session cookie on the console's origin. The SDK reads the session from `<AUTH_BFF_CONTEXT>/userinfo` and `/checksession`, refreshes it at `/refresh` and ends it at `/logout`. It never reaches Thunder, so `VITE_AUTH_BASE_URL`, `ASGARDEO_CLIENT_ID`, `ASGARDEO_SCOPE` and `ASGARDEO_RESOURCE` are unused: the gateway's own client config carries them.

- API calls go to a same-origin `CHOREO_BASE_API_URL` (`/_api/integration`) with the cookie and no `Authorization` header; the gateway puts the session's token on them. `BILLING_API_BASE_URL` goes the same way, on the cloud console's session (`/_api/billing/api/v1`).
- The org and profile come from the session's ID token claims (`ouHandle`, `ouId`, `ouName`).
- The scopes come from the session's `scope` (the SDK's `getGrantedPermissions()`), so `SCOPES_ENFORCED` works in this mode too. The gateway's client config decides which scopes are requested.
- There is no silent sign-in: the gateway's session check joins the cloud console's session itself.
- Calls to other hosts with the user's token (`VITE_OBSERVABILITY_URL`, the AI Integration Builder copilot) get no token in this mode. Their 401s go back to the caller and never end the session. A same-origin 401 ends it only when `<AUTH_BFF_CONTEXT>/checksession` reports signed out; otherwise the request is retried once.
- Same-origin requests carry `X-Requested-With: XMLHttpRequest`, so the gateway can require it against CSRF.
- `AUTH_BFF_CONTEXT` and `AUTH_BFF_SIGN_IN_URL` must be paths on the console origin (start with a single `/`); anything else is ignored.

Unset, the browser signs in itself with PKCE, as before.

## API Insights

The org-level API Insights page embeds the Moesif dashboard, the same way the API Platform console does.

- `MOESIF_APP_URL` is the Moesif origin: `https://web-dev.moesif.com` or `https://www.moesif.com`. Any other value leaves the page unconfigured.
- The console fetches a Moesif viewer token from ipaas-service (`CHOREO_BASE_API_URL`) at `/analytics/id-token`. ipaas-service forwards the call to platform-api, which serves it only on an internal route.

Moesif only answers an embed from origins it allowlists, so each console origin must be added on Moesif's side. Until then the page times out with Retry.

## Verification

After the app loads, the browser console shows:

```
✓ Runtime configuration loaded from config.json
```
