# Claude Code context — ipaas

## What this app is

The frontend for **WIP** (formerly Devant), WSO2's integration platform. Also builds as `cloud` and `icp` from the same source tree — controlled by the `PRODUCT` env var at build time.

- Stack: Vite 7, React 19, React Router 7, TanStack Query 5, TypeScript 5, pnpm
- Auth: Asgardeo OIDC (PKCE flow) + local username/password fallback
- Runtime config: `public/config.json` (loaded at startup, not baked into the bundle)
- Deployed WIP staging URL: `https://preview-o2-dev.devant.dev`

## Project structure

```
src/
  auth/          # AuthContext, OIDC token flow, STS exchange
  config/        # routes.tsx — all app routes defined here
  layouts/       # AppLayout (authenticated shell), PublicLayout, PolicyLayout
  pages/         # One file per page/route (~51 pages)
  components/    # Shared and composite components
  api/wip/       # WIP-specific API calls (resolved via #api/ alias)
  product/wip/   # WIP-specific components (resolved via #product/ alias)
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
/organizations/:org/projects/:project/prebuilt-integrations     → Prebuilt integrations (WIP only)
```

## Auth flow

1. User clicks a sign-in button on `/login`
2. `loginWithOIDC(fidp)` generates PKCE challenge → redirects to Asgardeo
3. Asgardeo redirects back to `/signin` with auth code
4. `OIDCCallback` exchanges code → calls `validate/user` → STS token exchange
5. Navigates to last project (localStorage) or projects/redirect

For tests, `global.setup.ts` logs in once and saves `storageState` to `.auth/user.json`. All specs reuse that state.

## Running the app

```bash
pnpm dev          # WIP on https://localhost:3000 (HTTPS)
pnpm dev:cloud    # Cloud variant
pnpm dev:icp      # ICP variant
```

## Running unit tests

```bash
pnpm test         # run once (CI-friendly)
pnpm test:watch   # watch mode
```

Vitest, no live backend or credentials needed. Co-located as `<file>.test.ts` next to the
source file (e.g. `src/utils/identifyIntegration.test.ts`). `#api`/`#product` resolve to
`wip` in tests, same as the IDE (see `vitest.config.ts`).

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

- **Product-specific code** lives under `src/api/wip/`, `src/api/cloud/`, `src/api/icp/` and is resolved via the `#api/` alias in `vite.config.ts`. Shared code goes in `src/api/`.
- **`IS_WIP` flag** gates WIP-only routes like prebuilt integrations. Check `routes.tsx` before adding routes.
- **`public/config.json`** is not committed with real credentials — it points to `preview-dv` by default. Each environment deploys its own config.
- **React Router v7** — uses the new `<Route>` JSX API, not the v6 object config. Check `src/config/routes.tsx`.
- **storageState in `.auth/`** is gitignored — it contains live session tokens. Never commit it.
