# AGENTS.md — src/auth

Sign-in, session and tokens, built on the Thunder SDK (`@thunderid/react`). Thunder is the WSO2 Cloud identity provider.

## Public surface

Code outside this folder imports only from `src/auth` (`index.ts`):

| Export                                                      | Use                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `AuthProvider`, `useAuth()`                                 | React session state: `isAuthenticated`, user fields, `loginWithOIDC(fidp?)`, `completeSignIn(params)`, `logout()` |
| `authenticatedFetch`, `getAccessToken`                      | Bearer requests outside React (used by `src/api/_client.ts`)                                                      |
| `getOrgUuidFromToken`                                       | The session's organization UUID (`useOrgUuid` wraps it for components)                                            |
| `saveRedirectUrl`, `getAndClearRedirectUrl`                 | Return to a deep link after sign-in                                                                               |
| `generateAndSaveGitHubState`, `validateAndClearGitHubState` | CSRF state for the GitHub App authorization round trip                                                            |

Add to `index.ts` only when code outside needs it. ESLint rejects imports of the files behind it.

## How it works

- `AuthProvider` waits for the SDK to settle and shows a loader until then, so no child renders or sends a request before the session is known.
- Once signed in, it connects the session to `session.ts`, the one place code outside React gets tokens from. It also stores the org handle as `icp:org_handle` in localStorage (`src/utils/storage.ts`).
- The SDK refreshes tokens itself. A 401 on an expired token ends the session.
- `/signin` (`OIDCCallback`) only routes after sign-in: it forwards Cloud Editor results, then opens the saved deep link or the user's last project.
- `logout()` clears the local session and leaves for Thunder's end-session endpoint. Thunder matches `postLogoutRedirectUris` exactly, so the client must list the URL the console actually sends: the bare origin for a root build, and `<origin><base path>/` for a build under a prefix (`afterSignOutUrl` in `thunderConfig.ts`). A prefixed deployment that registers only the origin fails sign-out.

## Rules

- **One organization per session.** The token is scoped to the organization chosen at sign-in and cannot be switched. A URL for another organization shows "no access" (`AppLayout`). Do not add org switching on the client.
- **No org creation in the console.** Thunder creates the organization at sign-up.
- **No password flows.** Thunder owns credentials, so the console has no password sign-in or password change.
- **Config keys** come from `window.API_CONFIG` (`thunderConfig.ts`): `VITE_AUTH_BASE_URL`, `ASGARDEO_CLIENT_ID`, `ASGARDEO_SCOPE`, `ASGARDEO_RESOURCE` and `ASGARDEO_SIGN_IN_REDIRECT_URL`. The names are historical and the deployments set them, so do not rename them here.
- **Token hygiene.** Never log a token or write one to storage yourself. The SDK owns its storage. `legacySession.ts` removes keys that older console builds left behind.

## Tests

Every file here has a `*.test.ts(x)` beside it. Mock the SDK as `AuthProvider.test.tsx` does, and keep tests independent of a real identity provider.
