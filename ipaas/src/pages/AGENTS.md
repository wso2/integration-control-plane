# src/pages/ — Page Components

## Purpose

Route-level components. Each file corresponds to one route. Same import rules as `src/components/` — no direct `api/` or transport imports.

---

## Import rules

| Allowed                                   | Not allowed                                  |
| ----------------------------------------- | -------------------------------------------- |
| `src/hooks/*`                             | `src/api/*`                                  |
| `src/types/*`                             | `#auth` data functions (see exception below) |
| `src/constants/*`                         | `authenticatedFetch`, `getOrgUuidFromToken`  |
| `src/utils/*`                             | Any named HTTP client                        |
| `src/components/*`                        |                                              |
| `src/contexts/*`                          |                                              |
| React Router (`useNavigate`, `useParams`) |                                              |

---

## Accepted exception — OAuth CSRF helpers

Three pages import directly from `#auth`:

| Page                                          | Imported symbols                                            | Why                                                                          |
| --------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Project.tsx`, `CreateIntegrationOptions.tsx` | `generateAndSaveGitHubState`, `validateAndClearGitHubState` | GitHub OAuth popup CSRF state — pure localStorage utilities, no network call |
| `OIDCCallback.tsx`                            | `validateAndClearOIDCState`, `getAndClearRedirectUrl`       | OIDC redirect landing — one-shot state extraction on arrival                 |

These are CSRF state helpers, not data access. All other `#auth` data functions (`getOrgUuidFromToken`, `authenticatedFetch`) must go through hooks.

---

## Org UUID

Use `useOrgUuid()` from `src/hooks/useOrgUuid.ts`. Never call `getOrgUuidFromToken()` directly.

---

## Navigation

Use `useAppNavigate()` from `src/hooks/useAppNavigate.ts` — **not** `useNavigate()`. It has the
same signature, and additionally fetches the destination route's chunk before changing the URL, so
the address bar and the page move together instead of the URL jumping ahead of a Suspense fallback.
`useNavigate()` is reserved for auth redirects that must be immediate (`OIDCCallback`, logout).

URL helpers live in `src/paths.ts` and `src/nav.ts`.

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

{
  IS_WIP && <BusinessInfo />;
}
```

Vite's `define` + Rollup DCE ensures the unused branch is not bundled.

### Before adding a page — check the product

Ask: does this page make sense for all three products (wip / cloud / icp)?

- **Yes** → add normally, no gating needed.
- **Only one product** → gate the route in `routes.tsx`.
- **Different layout per product** → consider the `#product` alias pattern (see `src/product/README.md`).
