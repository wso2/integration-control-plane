# src/components/ — UI Components

## Purpose

Reusable UI components. Pure presentation and interaction logic — no direct backend communication.

---

## Import rules

| Allowed                                          | Not allowed                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `src/hooks/*`                                    | `src/api/*`                                  |
| `src/types/*`                                    | `src/auth/tokenManager` (data functions)     |
| `src/constants/*`                                | `authenticatedFetch`, `getOrgUuidFromToken`  |
| `src/utils/*`                                    | Any named HTTP client                        |
| `src/assets/*`                                   |                                              |
| `src/contexts/*`                                 |                                              |
| `@wso2/oxygen-ui`, `@wso2/oxygen-ui-icons-react` |                                              |
| React Router (`useParams`, `Link`)               | `useNavigate` — use `useAppNavigate` instead |

If you need data, call a hook. If the hook does not exist yet, create it in `src/hooks/` first.

---

## Navigation

Use `useAppNavigate()` from `src/hooks/useAppNavigate.ts` rather than `useNavigate()`. Same
signature, but it preloads the destination route's chunk before changing the URL so the page and the
address bar commit together. `useNavigate()` stays only for auth redirects that must not wait.

---

## Org UUID

Use `useOrgUuid()` from `src/hooks/useOrgUuid.ts`. Never call `getOrgUuidFromToken()` directly.

---

## Product-specific variants

### Small toggles (1–2 elements)

Use the build-time flags from `src/features.ts`:

```tsx
import { IS_WIP, IS_ICP } from '../features';

// Renders only in the wip bundle; tree-shaken from cloud and icp
{
  IS_WIP && <CopilotButton />;
}
```

### Whole component differs per product — the shell pattern

When a component renders significantly differently across products, split it:

1. Keep the shared structural shell in `src/components/<ComponentName>/<ComponentName>Shell.tsx`.
2. Create a variant file per product in `src/product/<product>/<ComponentName>Body.tsx` that imports the shell.
3. The consumer imports via the `#product` alias:

```tsx
// src/components/EnvironmentCard/index.tsx
import EnvironmentCardBody from '#product/EnvironmentCardBody';
```

**Critical rule**: the shell must never import from `src/product/`. Product files import the shell — not the reverse. Reversing this would pull all product variants into every bundle, defeating dead code elimination.

Cloud and wip share the same UI. Only `src/product/icp/` is expected to accumulate variants over time.

See `src/product/README.md` for the full guide and decision table.

---

## Per-integration-type rendering (the surface + slots pattern)

Integration-level screens (under `/organizations/:o/projects/:p/components/:c/*`) vary
by **integration type** — automation, integration-as-api, file-integration, webhook,
mcp-server, ai-agent, tailscale-vpn, … Do **not** branch on type with ad-hoc booleans
(`isAutomation`, `isGenericService`, `GENERIC_SERVICE_TYPES`, `REST_API_TYPES`) inside
components. Use this structure instead.

### The pieces

- **Resolver** — `src/utils/identifyIntegration.ts` maps `(displayType, componentSubType)`
  → an `IntegrationIdentity` with a `type` discriminated union. **Type is identified
  once here and never re-derived.** Consume via `useIntegrationIdentity` (hook) or the
  pure `identifyIntegration` fn.
- **Central metadata** — `src/constants/integrationTypes.ts` (`INTEGRATION_TYPE_INFO`):
  `displayName` + `Icon` per type; each module spreads its entry.
- **Per-surface folder** — `src/components/<surface>/` (e.g. `overview/`):
  - `_shared/` — the surface's shell/frame, `IntegrationRenderer`, shared bodies + helpers.
  - `<type>/` — one folder per type, each exporting an `IntegrationModule`.
  - `registry.ts` — `Record<IntegrationType, () => import('./<type>')>`. Lazy chunks
    (a user viewing automation doesn't download MCP code); the `Record` forces a
    compile-time entry for every type.

### How a surface renders

The page calls `useIntegrationIdentity`, then `IntegrationRenderer` dynamically imports
the matching module and hands it to the surface shell. **The shell owns only the generic
frame + state every type shares; each type fills slots.** For Overview today:

| Slot             | Purpose                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `EnvCardBody`    | content-only body (no Card/header chrome)                            |
| `HeaderStatus`   | left header slot (status dot, Configure)                             |
| `EnvCardActions` | right header slot (action buttons)                                   |
| `CustomHeader`   | full header override — escape hatch when the header differs a lot    |
| `EnvCardFooter`  | optional footer                                                      |
| `CustomOverview` | full-surface override (type has no env-card concept, e.g. Tailscale) |

A type omits any slot it doesn't need — no null-returning placeholders. Bodies shared by
two types live in `_shared/bodies/` and are parameterised by **behaviour props, not type
flags**. See `src/components/Overview/README.md` for the concrete layout.

### Adding a new integration type

1. Add it to the `IntegrationType` union (`src/types/integration.ts`), a rule in
   `identifyIntegration`, and an `INTEGRATION_TYPE_INFO` entry.
2. Create `src/components/<surface>/<type>/index.ts` exporting an `IntegrationModule`
   (spread `INTEGRATION_TYPE_INFO[type]` + the slots it needs).
3. Point that surface's `registry.ts` entry at the new module.
4. Fetch type-specific data inside the slot via **domain** hooks (`useDeployments`,
   `useExecutions`, …) — one hook file per domain, never per type. The shell passes
   shared per-env data + cross-slot callbacks via `EnvCardSlotProps`.

### Rules (enforced by review)

- Zero `isAutomation` / `isGenericService` / `GENERIC_SERVICE_TYPES` / `REST_API_TYPES`
  under `src/components/<surface>/`. Branch via the registry + slots.
- Type-specific subcomponents live in the `<type>/` folder; truly shared chrome in
  `_shared/`. `_shared/` must never import a type folder.

### Status — this milestone

Only the **Overview** surface (`src/components/Overview/`) is built fully this way today.
The types with a real Overview module are **automation, integration-as-api,
file-integration, event-integration, ai-agent, and mcp-server** (the latter shared by
both `mcp-server` and `mcp-proxy` via the registry) — gated by `MIGRATED_INTEGRATION_TYPES`
in `pages/Component.tsx`; the rest fall back to `UnsupportedFallback`.

**Build, Develop, Deploy, Logs, ComponentHeader, and every other Integration-level
surface that customises by type should follow this same surface + slots structure when
migrated.** They currently use legacy per-type branching (e.g. Deploy's
`getComponentTypeFlags` in `src/utils/componentType.ts`) — do not extend those utils with
new discriminators; add the type to `identifyIntegration` and consume it instead. A few
surfaces already do this as targeted stopgaps pending full migration:

- **Deploy** (`pages/Deploy.tsx`, `BuildArea`, `DeployEnvironmentCard`) hides endpoint UI
  for file-/event-/ai-agent integrations via a `hideEndpoints` flag derived from
  `identifyIntegration` (they share a service `displayType` but expose no endpoints).
- **Test** (`layouts/AppLayout.tsx`) routes ai-agent to a chat surface (`test/agent-chat`,
  `pages/AgentChatConsole.tsx`) instead of the API console, again keyed off
  `identifyIntegration`, not a new `displayType` set.

Cross-surface shared pieces (e.g. **`components/AgentChat.tsx`**, consumed by both the
ai-agent Overview body and the Test page) live at the top of `components/`, not under a
single surface folder.

---

## Adding a component

1. Determine if the component is shared or product-specific (see product gating in `AGENTS.md` at the repo root).
2. If shared: create the file under the appropriate subdirectory (or directly in `components/`).
3. If product-specific as a whole: use the shell pattern above.
4. Import data via hooks only.
5. Keep server state out of local `useState` — derive it from the hook's return value instead.
