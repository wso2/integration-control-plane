# Claude Code context — ipaas

## What this app is

The frontend for WSO2's integration platform (formerly Devant).

- Stack: Vite 7, React 19, React Router 7, TanStack Query 5, TypeScript 5, pnpm
- Auth: WSO2 Identity Platform OIDC (PKCE flow) + local username/password fallback
- Runtime config: `public/config.json` (loaded at startup, not baked into the bundle)
- Deployed WIP staging URL: `https://preview-o2-dev.devant.dev`

## Project structure

```
src/
  auth/          # Auth and token management — import it only via the #auth alias
  config/        # routes.tsx — all app routes defined here
  layouts/       # AppLayout (authenticated shell), PublicLayout, PolicyLayout
  pages/         # One file per page/route (~51 pages)
  components/    # Shared and composite components
  api/           # API call modules
  unported/      # Features the cloud BFF can't serve yet (ni() stubs); live code never imports from here
public/
  config.json    # Runtime config (API URLs, Asgardeo client ID, etc.)
tests/e2e/       # Playwright smoke suite (see tests/e2e/README.md)
playwright.config.ts
```

## Key URL patterns

All authenticated routes are under `/organizations/:orgHandler/`. The `orgHandler` is dynamic per user — never hardcode it.

```
/login                                                          → Login
/signin                                                         → OIDCCallback (auth code exchange)
/organizations/:org/projects/redirect                           → Projects list (with ToS dialog)
/organizations/:org/projects/new                                → Create project
/organizations/:org/projects/:project/home                      → Project home
/organizations/:org/projects/:project/components/new            → Create integration options
/organizations/:org/projects/:project/components/:comp/overview → Integration overview
/organizations/:org/projects/:project/prebuilt-integrations     → Prebuilt integrations
```

## Auth flow

1. User clicks a sign-in button on `/login`
2. `loginWithOIDC(fidp)` generates PKCE challenge → redirects to WSO2 Identity Platform
3. WSO2 Identity Platform redirects back to `/signin` with auth code
4. `OIDCCallback` exchanges code → calls `validate/user` → STS token exchange
5. Navigates to last project (localStorage) or projects/redirect

Cloud differs: `/login` hands off to Thunder through the Thunder SDK (`@thunderid/react`), which exchanges the code and refreshes tokens itself; `OIDCCallback` only forwards Cloud Editor results and routes. See `src/auth/cloud/`.

For tests, `global.setup.ts` logs in once and saves `storageState` to `.auth/user.json`. All specs reuse that state.

## Running the app

```bash
pnpm dev          # WIP on https://localhost:3000 (HTTPS)
pnpm dev:cloud    # Cloud variant
```

## Running unit tests

```bash
pnpm test:unit           # run once (CI / pre-push)
pnpm test:unit:watch     # watch mode for local development
pnpm test:unit:ui        # Vitest browser UI
```

Unit tests live alongside their source as `*.test.ts` / `*.test.tsx`. The current suite covers all utility modules in `src/utils/`. See `vitest.config.ts` for environment and alias setup.

## Running e2e tests

```bash
# First-time setup — copy the example and fill in credentials
cp .env.test.example .env.test

# Run tests (credentials loaded automatically from .env.test)
pnpm test:e2e
pnpm test:e2e:ui        # interactive Playwright UI
pnpm test:e2e:report    # open last HTML report
```

Credentials are stored in `.env.test` (gitignored). In CI, GitHub Actions secrets are used instead — see `.github/workflows/e2e-nightly.yml`.

See `tests/e2e/README.md` for full setup and troubleshooting.

## Things to know before changing code

- **`public/config.json`** is not committed with real credentials — it points to `preview-dv` by default. Each environment deploys its own config.
- **React Router v7** — uses the new `<Route>` JSX API, not the v6 object config. Check `src/config/routes.tsx`.
- **storageState in `.auth/`** is gitignored — it contains live session tokens. Never commit it.
