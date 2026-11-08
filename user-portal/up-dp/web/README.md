# UP-DP web

The User Portal's single-page app. UP-DP (the Go BFF in `up-dp/`) serves the build from `dist/`
next to its `/api/v1` routes, so the browser sees one origin.

It follows the integration console in `wso2/integration-control-plane` (`ipaas/`, branch
`devant-migration`): the same stack (Vite 7, React 19.2.3, React Router 7, TanStack Query 5,
Oxygen UI 0.15), the same app shell, and the same page, listing and drawer patterns. The workflow
screens follow the control plane's workflow UI.

## Run it

Start `ipaas-mock` and `up-dp` (see the repository README), then:

```bash
pnpm install
```

```bash
pnpm dev
```

Open http://localhost:5173. The dev server passes `/api` and `/config.js` to `UP_DP_URL`
(default `http://localhost:9200`): the mock gateway, which checks the token and passes the
request on to the BFF, as the published environment's gateway does. `pnpm build` type-checks and
writes `dist/`.

## Config

`index.html` loads `/config.js` with a plain `<script>` before the app's module script, so the
config is in place before the first render. UP-DP builds the script once at startup from its
environment; it sets `window.__UP_DP_CONFIG__` to the `PortalConfig` in `docs/api.md`: the names,
theme, footer links, org, and the portal app's `issuer` and `clientId`. The scopes to sign in
with change as integrations are published, so the SPA reads them from `/api/v1/auth/scopes`
instead, and joins the session again without a page when they change.
`src/config/portalConfig.tsx` reads it, and falls back to the default name and theme when the
script did not load; starting the session then reports the outage.

## Layout

| Path | What it holds |
|---|---|
| `src/api/` | One client per backend: `portal.ts` (UP-DP), `agents.ts` and `workflows.ts` (the gateway) |
| `src/auth/` | The in-memory access token and the session provider. Import from `src/auth` only |
| `src/hooks/` | TanStack Query hooks over `api/`. Pages and components never call `api/` directly |
| `src/pages/` | One component per route: Overview, My Tasks, the listing per kind, an integration |
| `src/components/` | Shared console pieces (`detail.tsx` drawers and section cards, `SchemaEditor`, `IntegrationHeader`) and one folder per kind |
| `src/layouts/AppLayout.tsx` | The signed-in shell: Oxygen `AppShell`, header, sidebar, footer |
| `src/paths.ts` | Every in-app URL |
| `src/i18n/` | The `t()` that reads the strings, and the strings, one JSON file per area under `locales/en/` |

## Sign-in

The SPA is the WIdP-DP's public client (`src/auth/tokens.ts`). It reads the issuer's
`/.well-known/openid-configuration` once per page, refuses a document whose `issuer` is not the
configured one byte for byte, and takes the authorize, token, revocation and end-session
endpoints from it. It builds the redirect URI (`/auth/callback`) and the post-logout URI (`/`)
on `window.location.origin`, so every origin the portal answers on works once it is registered
on the ThunderID app. A tab with no tokens first tries the WIdP-DP's session in a hidden
`prompt=none` iframe, as the cloud console does, and redirects to sign in only when that answers
`login_required` or takes over 3 seconds; the redirect shows ThunderID's page only when it has to.
ThunderID's session cookie is `SameSite=Lax`, so the iframe reaches it only where the portal and
ThunderID are the same site (both HTTPS under one domain); locally the two differ in scheme, and
the iframe answers `login_required` at once. Joining again later (a spent refresh token, changed
scopes) tries the iframe too, then a `prompt=none` redirect. `/auth/callback` redeems the code
with PKCE; in the iframe it only posts the answer to the page that opened it. The access, refresh and ID tokens
are one JSON object in the tab's `sessionStorage`, renewed a minute before the access token
expires. Signing out reaches every tab over a `BroadcastChannel`, then ends the WIdP-DP's session.
The access token goes to `/api/v1` and to the gateway, where the agents and workflows run.

## Look

The config from `/config.js` names the theme and the portal. `PORTAL_THEME` is one of
`choreoLabs` (default; the integration console's blue theme), `acrylicOrange` (the WSO2 Cloud consoles' theme, with its faint orange glow), `oxygen`, `acrylicPurple`, `classic`, `wso2`,
`highContrast`, `paleBase`, `paleGray` or `paleIndigo`. `PORTAL_PRIMARY_COLOR` (`#RRGGBB`)
replaces the theme's primary colour. The colour scheme follows the system until the user picks
one with the toggle in the header. `PORTAL_LOGO_LIGHT_URL` and `PORTAL_LOGO_DARK_URL` replace the
WSO2 Integration Platform wordmark on a light and on a dark background; one set alone serves both.

## Languages

Every string the SPA shows is in `src/i18n/locales/en/`, one JSON file per area, read with
`t('<area>.<key>')` from `useTranslation()` in `src/i18n` (`i18n.t` outside React). The keys are
type-checked against the English files, so a missing or misspelt key fails `pnpm build`. Plurals
use `_one`/`_other` suffixes picked by `count`, and dates, times and relative times are formatted
with `Intl` in English.

The portal ships English only. `src/i18n/index.ts` is a small stand-in for i18next, which is
waiting on security review: it takes the same keys, `{{name}}` values, plurals and
`returnObjects`, so bringing i18next back changes only that file and `package.json`.
