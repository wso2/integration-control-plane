# src/pages/ — Page Components

## Purpose

Route-level components. Each file corresponds to one route. Same import rules as `src/components/` — no direct `api/` or transport imports.

---

## Import rules

| Allowed | Not allowed |
|---|---|
| `src/hooks/*` | `src/api/*` |
| `src/types/*` | `auth/tokenManager` (data/token access — see exception below) |
| `src/constants/*` | `authenticatedFetch`, `getOrgUuidFromToken` |
| `src/utils/*` | Any named HTTP client |
| `src/components/*` | |
| `src/contexts/*` | |
| `auth/oauthState` (pure OAuth CSRF state — see below) | |
| React Router (`useNavigate`, `useParams`) | |

---

## Accepted exception — OAuth CSRF helpers

`src/auth/oauthState.ts` is a separate module from `auth/tokenManager.ts`, holding only pure
localStorage/sessionStorage CSRF-state helpers — no token or network access. Pages may import
it directly:

| Page | Imported symbols | Why |
|---|---|---|
| `Project.tsx`, `CreateIntegrationOptions.tsx` | `generateAndSaveGitHubState`, `validateAndClearGitHubState` | GitHub OAuth popup CSRF state |
| `OIDCCallback.tsx` | `validateAndClearOIDCState`, `getAndClearRedirectUrl` | OIDC redirect landing — one-shot state extraction on arrival |

`auth/tokenManager` itself (`getOrgUuidFromToken`, `authenticatedFetch`, ...) is never importable
from pages — ESLint blocks the whole module, with no per-file exception. Because the CSRF
helpers live in their own file, this is an allowlist by construction: a new function added to
`tokenManager.ts` can't become reachable from a page without also being added to
`oauthState.ts` first.

---

## Org UUID

Use `useOrgUuid()` from `src/hooks/useOrgUuid.ts`. Never call `getOrgUuidFromToken()` directly.

---

## Navigation

Use `useNavigate()` from React Router. URL helpers live in `src/paths.ts` and `src/nav.ts`.

---

## Product-specific pages

### Pages that exist in only one product

Gate the route in `src/config/routes.tsx` using build-time flags:

```tsx
import { IS_WIP } from '../features';

...(IS_WIP ? [
  { path: '/prebuilt-integrations', element: <PrebuiltIntegrations /> },
] : [])
```

The page file stays in `src/pages/` — the gating happens in the route definition, not in the component.

### Pages with minor product differences

Use inline flags from `src/features.ts`:

```tsx
import { IS_WIP } from '../features';

{IS_WIP && <BusinessInfo />}
```

Vite's `define` + Rollup DCE ensures the unused branch is not bundled.

### Before adding a page — check the product

Ask: does this page make sense for all three products (wip / cloud / icp)?

- **Yes** → add normally, no gating needed.
- **Only one product** → gate the route in `routes.tsx`.
- **Different layout per product** → consider the `#product` alias pattern (see `src/product/README.md`).
