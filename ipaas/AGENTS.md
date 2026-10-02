# ICP iPaaS — Agent Guide

## What this app is

WSO2 Integration Control Plane (ICP) iPaaS frontend. A React + TypeScript SPA that lets users create, deploy, and manage integrations across cloud and on-premise environments. It talks to a set of Choreo/WSO2 backend services via REST and GraphQL.

---

## Four-layer architecture

Every feature follows a strict four-layer separation. Violating these boundaries is the most common class of error an AI agent can introduce.

```text
┌─────────────────────────────────────────────────┐
│  pages/   components/                           │  UI only
│  Import from: hooks/, types/, constants/,       │
│               utils/, assets/, auth/ (OAuth      │
│               state utilities only — see below) │
└───────────────┬─────────────────────────────────┘
                │ imports
┌───────────────▼─────────────────────────────────┐
│  hooks/                                         │  React Query wrappers
│  Import from: api/, types/, config/             │
│  Never: JSX, UI state, navigation               │
└───────────────┬─────────────────────────────────┘
                │ imports
┌───────────────▼─────────────────────────────────┐
│  api/                                           │  Pure async service fns
│  Import from: #auth (clients only),             │
│               config/, types/                   │
│  Never: React hooks, JSX                        │
└───────────────┬─────────────────────────────────┘
                │ imports
┌───────────────▼─────────────────────────────────┐
│  #auth → src/auth/{cloud,wip}/                  │  HTTP transport + token mgmt
│  api/httpClients.ts   api/graphql.ts            │
└─────────────────────────────────────────────────┘

types/      ← imported by any layer, never imports from any layer
constants/  ← same
utils/      ← same; every file has a co-located *.test.ts Vitest unit test
config/     ← same
```

**The single most important rule**: components and pages must never import directly from `api/`, `#auth` data functions, or any backend transport. All data access goes through `hooks/`.

---

## The one accepted exception

`#auth` exports two categories of functions:

| Category                                        | Examples                                                                                                           | Used in                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| OAuth CSRF state (pure local storage utilities) | `generateAndSaveGitHubState`, `validateAndClearGitHubState`, `validateAndClearOIDCState`, `getAndClearRedirectUrl` | pages — acceptable             |
| Token/data access                               | `getOrgUuidFromToken`, `authenticatedFetch`                                                                        | hooks only, via `useOrgUuid()` |

Pages may import the OAuth CSRF helpers directly because they are pure client-side state utilities with no cache semantics, not data access.

---

## Product gating — shared vs product-specific

This codebase builds three distinct products from one source tree:

| `PRODUCT` | Description                      |
| --------- | -------------------------------- |
| `wip`     | Choreo v2 / preview-dv (default) |
| `cloud`   | Choreo v3 / cloud                |
| `icp`     | Local / ICP desktop              |

### Build-time flags

`src/features.ts` exports three boolean constants that Vite replaces at build time. Rollup/esbuild eliminates dead branches — unused product code never reaches the bundle.

```ts
import { IS_WIP, IS_CLOUD, IS_ICP } from '../features';
```

`__PRODUCT__` is a Vite `define` global; never read it directly. Use the flags from `features.ts`.

### Before you write product-specific code — ask yourself

1. **Is this feature shared across all products?** → No gating needed, code stays in `src/components/` / `src/pages/` / `src/api/` as usual.
2. **Is this a small 1–2 element toggle?** → Use `IS_WIP` / `IS_ICP` inline.
3. **Are many toggles following a consistent pattern?** → Add a named export to `src/features.ts` (e.g. `export const SHOW_FOO = IS_WIP || IS_CLOUD`).
4. **Does a whole component/page render completely differently per product?** → Use the `#product` alias (see below).
5. **Does a page only exist in one product?** → Gate the route in `src/config/routes.tsx` using `IS_WIP` etc.

### `#api` alias — product-specific API implementations

Vite resolves `#api` → `src/api/${product}/` at build time. Hooks import directly through the alias — there are no domain barrel files in `src/api/` root.

```ts
// src/hooks/useComponents.ts
import { fetchComponents } from '#api/components';
```

Only the selected product's implementation enters the bundle.

| Directory              | Purpose                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `src/api/wip/`         | Real GraphQL/REST implementations (Choreo v2)                            |
| `src/api/cloud/`       | Placeholder stubs (throw `[cloud] x: not implemented`)                   |
| `src/api/icp/`         | Placeholder stubs (throw `[icp] x: not implemented`)                     |
| `src/api/contracts.ts` | Single source of truth for function signatures each product must satisfy |

Each product folder has a `_check.ts` that performs compile-time assertion against `contracts.ts`. Drift between any product's exports and the contract becomes a TypeScript error during `tsc`/build.

When you add a new API function, add it to **all three** product implementations with the same signature, and update `contracts.ts`. Real logic goes in `wip/`; the cloud and icp stubs throw via `ni()`. See `src/api/AGENTS.md` for the step-by-step procedure.

### `#product` alias — product-specific UI variants

When a whole component needs a different implementation per product, use the `#product` alias:

```ts
// consumer
import EnvironmentCardBody from '#product/EnvironmentCardBody';
```

Vite resolves `#product` → `src/product/${product}/`. Only the selected product's file enters the bundle (DCE preserved).

**Shell pattern** — extract shared structure into a shell component:

```text
src/components/EnvironmentCard/EnvironmentCardShell.tsx  ← shared shell
src/product/icp/EnvironmentCardBody.tsx                  ← icp variant (imports shell)
src/product/wip/EnvironmentCardBody.tsx                  ← wip variant (imports shell)
```

The shell must **not** import product files — that would pull all variants into every bundle.

Cloud and wip share the same UI; only `src/product/icp/` accumulates UI variants.

See `src/product/README.md` for the full guide.

### `#auth` alias — product-specific auth

Vite resolves `#auth` → `src/auth/cloud/` for `cloud`, and `src/auth/wip/` for `wip` and `icp`. App code imports auth only from `#auth`; ESLint rejects relative imports into `src/auth/`.

| Path                   | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `src/auth/contract.ts` | Types only — the `AuthModule` surface both implementations must satisfy |
| `src/auth/wip/`        | WSO2 Identity Platform OIDC + STS exchange, and local login (ICP)       |
| `src/auth/cloud/`      | Cloud (Thunder) auth                                                    |
| `src/auth/shared/`     | Non-auth helpers both re-export (redirect URL, GitHub OAuth state)      |

The two implementations share no logic, only the contract. Each folder has a `_check.ts` that asserts its exports against `AuthModule`.

### TypeScript paths

`tsconfig.app.json` maps all three aliases (`#api`, `#product`, `#auth`) to the `wip/` folder for type checking regardless of build product. This means the IDE always type-checks against wip implementations — which is intentional since wip is the reference product (the only one with real implementations today).

---

## Adding a new API endpoint — end to end

1. **`src/types/<domain>.ts`** — add or extend the TypeScript type
2. **`src/api/wip/<domain>.ts`** — add the real implementation using the appropriate client from `httpClients.ts`
3. **`src/api/cloud/<domain>.ts`** and **`src/api/icp/<domain>.ts`** — add a matching stub that throws `[cloud] domain.fn: not implemented`
4. **`src/api/contracts.ts`** — add or update the function signature in the relevant domain interface
5. **`src/hooks/use<Domain>.ts`** — wrap with `useQuery` or `useMutation`; set a stable `queryKey`; import via `'#api/<domain>'`
6. **`src/components/` or `src/pages/`** — call the hook; never call the service function directly

---

## Key technology choices

| Concern                | Solution                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| Server state / caching | TanStack Query (React Query v5) — `useQuery`, `useMutation`, `useQueryClient`                |
| UI components          | `@wso2/oxygen-ui` and `@wso2/oxygen-ui-icons-react`                                          |
| Routing                | React Router v7 (`useNavigate`, `useParams`)                                                 |
| GraphQL                | `gql()` helper in `api/graphql.ts` — returns a typed fetch function                          |
| Runtime config         | `window.API_CONFIG` — shape defined in `src/config/runtimeConfig.ts`                         |
| Org UUID               | `useOrgUuid()` hook (`src/hooks/useOrgUuid.ts`) — never call `getOrgUuidFromToken()` from UI |

---

## Styling with `sx`

Use the `sx` prop for styling `@wso2/oxygen-ui` (MUI) components. Keep it readable and avoid needless re-allocation:

1. **Inline `sx` is for small, one-off styling** — a few properties on a component that isn't repeated.
2. **Hoist static `sx` to module scope.** A `sx={{ ... }}` literal is re-created on every render; for anything non-trivial — especially components rendered in a list/loop (table rows, cards) — define the object once at module scope as a named `as const` constant.
3. **Extract to a co-located `*.styles.ts` past the threshold.** When a component file has **more than 5 `sx` usages**, OR any single `sx` object has **more than 6 properties**, OR the same style repeats, move the styles into a co-located `<name>.styles.ts` exporting named `as const` objects — **each object formatted multi-line, one property per line** (not a single-line literal). Reference: `src/constants/styles.ts` (shared) and `src/components/Overview/_shared/bodies/styles.ts` (co-located, incl. `(args) => ({ ... }) as const` factories for dynamic styles).
4. **Keep dynamic styles parameterized, not inlined.** Prop/state-driven styling belongs in a `(args) => ({ ... }) as const` factory in the styles file, or inline only when it's a single computed value.
5. **Use `styled()`** for reusable structural wrappers, not one-off tweaks. Prefer theme tokens (`'primary.main'`, `'text.secondary'`, `'divider'`, `'action.hover'`) over hardcoded hex so styling stays theme-aware.

---

## Directory reference

```text
src/
  api/              Per-product API implementations resolved via #api alias (see src/api/AGENTS.md)
    contracts.ts    Single source of truth — function signatures every product must implement
    wip/            Real GraphQL/REST implementations (Choreo v2)
    cloud/          Not-implemented stubs for cloud product
    icp/            Not-implemented stubs for icp product
  product/          Product-specific UI variants resolved via #product alias (see src/product/README.md)
    wip/            Wip UI variants
    cloud/          Cloud UI variants (currently empty — cloud shares wip UI)
    icp/            ICP UI variants
  hooks/            React Query hooks, one file per domain (see src/hooks/AGENTS.md)
  types/            TypeScript types — the layer contract (see src/types/AGENTS.md)
  components/       Reusable shared UI components (see src/components/AGENTS.md)
  pages/            Route-level page components (see src/pages/AGENTS.md)
  features.ts       Build-time IS_WIP / IS_CLOUD / IS_ICP flags
  auth/             Per-product auth behind the #auth alias (see `#auth` alias above)
  config/           Runtime config helpers (runtimeConfig.ts, statusColors.ts)
  constants/        Static lookup tables, style constants, route constants
  contexts/         React context providers (non-server state only)
  layouts/          App shell and layout wrappers
  utils/            Pure utility functions (no React, no API calls); each file has a co-located *.test.ts — run with pnpm test:unit
  assets/           SVG icons and static assets
  mock-data/        Local mock fixtures for development
```

---

## Common mistakes to avoid

- **Do not add `useQuery`/`useMutation` inside `api/` files.** They belong in `hooks/`.
- **Do not call `fetch` or `authenticatedFetch` inside a component or page.** Write a service function in `api/` and a hook in `hooks/`.
- **Do not add new types inline in `api/` or `hooks/` files.** Types go in `src/types/`.
- **Do not create a new HTTP client.** Reuse the appropriate named client from `api/httpClients.ts`.
- **Do not import `useQuery`/`useMutation` directly in pages/components.** Use the domain hook.
- **Do not read `__PRODUCT__` directly.** Use `IS_WIP`, `IS_CLOUD`, `IS_ICP` from `src/features.ts`.
- **Do not import from `src/api/wip/` (or `cloud/`/`icp/`) directly.** Always use the `#api/<domain>` alias so the build picks the correct product.
- **Do not put a product variant file in `src/components/` or `src/pages/`.** Product-specific whole-component variants go in `src/product/<product>/`.
- **Do not add new API functions only to `src/api/wip/`.** Add a matching stub to `cloud/` and `icp/` too, and update `src/api/contracts.ts` — otherwise `_check.ts` will fail to compile.
- **When adding a new file to `src/utils/`, also add a co-located `*.test.ts`.** Pure utility functions must have unit tests; run `pnpm test:unit` to verify.
