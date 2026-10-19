# Runtime Configuration

The console reads its backend URLs from `/config.json` when it starts, so one build runs in every environment.

## How it works

1. `src/config/runtimeConfig.ts` fetches `/config.json` before the app renders and maps it onto `window.API_CONFIG`.
2. Each key overrides its default in `DEFAULT_CONFIG` on its own. A key that is missing keeps its default.
3. If `config.json` fails to load, the app boots on the defaults and logs `Failed to load runtime config, using defaults`. The defaults are placeholders, not a working environment.

`public/config.json` is copied to `dist/config.json` on build. It points at the local k3d stack. Each deployment mounts its own file over it. In wso2cloud-deployment that is the `config.json` in the ipaas-console `ReleaseBinding`.

`pnpm dev` and `pnpm preview` cannot sign in against the local stack yet. They serve the console over https on `localhost:3000`, so the stack's plain-http Thunder and observability hosts are blocked as mixed content, and the local Thunder only accepts the deployed console's redirect URI. Try changes by deploying the console into the local stack instead.

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
| `VITE_OBSERVABILITY_URL`                                                     | Observability proxy (logs and metrics)                                                                                   |
| `SYSTEM_APIS_BASE_URL`, `SYS_API_PREFIX`                                     | System APIs gateway (component logs, usage insights)                                                                     |
| `BILLING_API_BASE_URL`                                                       | Billing user API. Loading the billing org activates the org's subscription.                                              |
| `ENABLE_BILLING_FEATURE`, `BILLING_CONSOLE_URL`, `CHOREO_SAAS_OFFER_URL`     | Upgrade button and billing links                                                                                         |
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_AUTH_REDIRECTION_URL` | GitHub App authorization and installation. GitHub is off without the client ID.                                          |
| `EDITOR_CALLBACK_ORIGINS`, `EDITOR_CALLBACK_DOMAINS`                         | Comma-separated https origins and parent domains an editor's sign-in or GitHub result may be sent to. Empty allows none. |
| `CHOREO_URL_MANAGER_URL`, `ENABLE_CUSTOM_URL_MAPPINGS_FEATURE`               | URL settings for an integration. Both are needed.                                                                        |
| `ENABLE_ENVIRONMENT_MANAGED_MODE`                                            | `true` hides the Environments pages, when environments are managed outside the console.                                  |
| `ENABLE_DEPLOYMENT_PIPELINE_MANAGED_MODE`                                    | `true` hides the organization Pipelines pages, when pipelines are managed outside the console.                           |
| `SAMPLES_URL`, `PREBUILT_INTEGRATIONS_URL`                                   | Sample and prebuilt integration catalogs. Both default to GitHub raw.                                                    |
| `RAG_INGESTION_IMAGE`                                                        | Image the RAG ingestion wizard deploys                                                                                   |
| `INTEGRATION_BUILDER_*`                                                      | AI Integration Builder: copilot base URL, model, max tokens, connectors GraphQL URL                                      |
| `AI_COPILOT_URL_SUFFIX`                                                      | Copilot path on the system APIs gateway                                                                                  |

Sign-out returns to the page origin. Thunder must list that origin in the client's `postLogoutRedirectUris`.

## Verification

After the app loads, the browser console shows:

```
✓ Runtime configuration loaded from config.json
```
