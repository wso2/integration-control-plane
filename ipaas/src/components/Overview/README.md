# Overview surface — per-integration-type rendering

The Overview page (`pages/Component.tsx`) renders an env-card UI that varies by
**integration type** (automation, integration-as-api, file-integration, …). It uses
the **surface + slots** pattern. This README maps _this_ directory; the rules and
the "how to add a type" steps are under **Per-integration-type rendering** below.

## Structure

```text
Overview/
├── _shared/                     generic frame + dispatch — NO type-specific logic
│   ├── OverviewShell.tsx        lays out env cards + PromoteButton between envs
│   ├── IntegrationRenderer.tsx  lazy-loads the type module from the registry;
│   │                            shows skeleton cards while the chunk loads
│   ├── EnvCardShell.tsx         the env-card FRAME. Owns ONLY shared state:
│   │                            deployment fetch + polling, notification,
│   │                            pending-trigger bridge, refresh. Renders the slots.
│   ├── EnvCardHeader.tsx        thin header frame: env name + commit + Refresh,
│   │                            with {status} (left) and {actions} (right) slots
│   ├── EnvCardSkeleton.tsx      common body loading skeleton
│   ├── EndpointUrlsPanel.tsx    Endpoint selector + visibility URLs + Download Spec
│   │                            (shared by integration-as-api + ai-agent bodies)
│   ├── StatusDot.tsx            presentational status dot (composed by a type)
│   ├── ConfigureButton.tsx      presentational Configure button — flips to
│   │                            "Configure to Continue" when required configs are unset
│   ├── configStatus.ts          hasMissingRequiredConfigs() — shared by automation,
│   │                            file/event, ai-agent (drives the button + Run/Schedule)
│   ├── UserPortalSharedAction.tsx  EnvCardSharedAction: the User Portal's Publish /
│   │                            Unpublish / "User Portal off" action. useIntegrationModule
│   │                            adds it to the types in constants/userPortal.ts USER_PORTAL_TYPES
│   ├── FileEventHeader.tsx      shared CustomHeader for file- + event-integration
│   │                            (status dot + Configure + Stop/Start; logs are in the body)
│   ├── HeaderShell.tsx          integration-level header rendered above the cards
│   ├── UnsupportedFallback.tsx  module for not-yet-migrated types (CustomOverview)
│   ├── UnsupportedOverview.tsx
│   └── bodies/                  bodies shared by >1 type
│       ├── FileEventBody.tsx    runtime-log stream (file- + event-integration)
│       └── OperationTile.tsx / OperationHeader.tsx
│                                operation/tool tile + drawer header
│                                (integration-as-api swagger ops + mcp-server tools)
├── automation/                  one folder per type → exports an IntegrationModule
│   ├── index.ts                 { ...INTEGRATION_TYPE_INFO['automation'], …slots }
│   ├── HeaderStatus.tsx         Configure + missing-config state (no status dot)
│   ├── EnvCardActions.tsx       Schedule / Run / next-run + cron auto-fire
│   ├── EnvCardBody.tsx          executions table + schedule banner + insights
│   └── … (RunButton, ScheduleButton, dialogs, insights, configStatus)
├── integration-as-api/          status dot + Configure / Test·Logs·Stop·Start /
│   │                            endpoint URLs + swagger + service insights
│   ├── HeaderStatus.tsx  EnvCardActions.tsx  EnvCardBody.tsx  (EndpointUrlsPanel is in _shared/)
│   ├── ApiSecurityAction.tsx    HeaderActions: a "Configure security" link under Open in Cloud
│   │                            Editor, for the entry environment; each card's SecuritySummary
│   │                            shows what its env enforces
│   └── ServiceInsights / ServiceLogsDrawer / SwaggerOperationsList
├── file-integration/            index.ts → shared FileEventHeader + FileEventBody
├── event-integration/           index.ts → shared FileEventHeader + FileEventBody
├── ai-agent/                    status dot + Configure(hideEndpoints) / Test·Logs·Stop·Start;
│   │                            body is an inline chat against the deployed agent
│   ├── HeaderStatus.tsx         status dot + Configure / Configure-to-Continue
│   ├── EnvCardActions.tsx       Test (→ test/agent-chat) · View Logs · Stop/Start
│   └── EnvCardBody.tsx          shared EndpointUrlsPanel (non-critical) + <AgentChat>
├── voice-agent/                 status dot / View logs·Stop·Start / token service URL +
│                                in-browser LiveKit voice tester (components/VoiceAgent/)
├── mcp-server/                  MCP Server + MCP Proxy (registry maps both here):
│   │                            tools list via the MCP SDK + Configure Policies action
│   ├── HeaderStatus.tsx  EnvCardActions.tsx  EnvCardBody.tsx  OverviewHeaderActions.tsx
│   └── McpToolTile.tsx / McpToolDrawer.tsx  (reuse _shared/bodies/OperationTile + OperationHeader)
├── workflow/                    integration-as-api's status + actions minus Test (`hideTest`); the
│                                User Portal switch in the footer; the webhook body (endpoints +
│                                insights) with the workflow content between them once the
│                                deployment is active (Workflows/overview/: definitions + figures)
└── registry.ts                  IntegrationType → () => import('./<type>')  (one chunk per type)
```

> **Cross-surface note:** the chat itself lives at **`src/components/AgentChat.tsx`** (top
> level, _not_ under `overview/`) because two surfaces consume it: the ai-agent
> `EnvCardBody` here and the Test page (`pages/AgentChatConsole.tsx`, route
> `test/agent-chat`). Its message/connection types are in `src/types/agentChat.ts`.

## The model in one line

`EnvCardShell` (frame + shared state) renders each type's **slots**:
`CustomHeader` **or** (`HeaderStatus` + `EnvCardActions`), then `EnvCardBody`, then the
loader's `EnvCardSharedAction` in the footer. A type with no env-card concept (e.g. Tailscale) exports
`CustomOverview` and bypasses the shell entirely.

| Slot                  | Who provides it               | Example                                                      |
| --------------------- | ----------------------------- | ------------------------------------------------------------ |
| `EnvCardBody`         | every rendered type           | executions table / endpoints / runtime logs / agent chat     |
| `HeaderStatus`        | types with a status/Configure | service / ai-agent status dot + Configure                    |
| `EnvCardActions`      | types with header actions     | Run/Schedule, Stop/Test/Logs                                 |
| `CustomHeader`        | header outliers               | file- + event-integration (shared `FileEventHeader`)         |
| `EnvCardSharedAction` | the loader, never a type      | User Portal action (USER_PORTAL_TYPES), in the card's footer |
| `CustomOverview`      | full-surface outliers         | Tailscale                                                    |
| `HeaderActions`       | integration-level actions     | integration-as-api's Configure security link                 |

`ai-agent` uses the generic-frame slots (`HeaderStatus` + `EnvCardActions` + `EnvCardBody`)
like integration-as-api — it's a generic service under the hood (`componentSubType: aiAgent`),
so it Tests (→ `test/agent-chat`), shows logs, and Stop/Starts. File/event use a `CustomHeader`
instead and have **no** Test/View-Logs buttons (their body _is_ the log stream).

The shell passes shared per-env data (deployment status, `releaseId`, build ids) and
cross-slot callbacks (`onNotify`, `onTrigger`, `requestPoll`) to every slot via
`EnvCardSlotProps`. Each slot fetches any **type-specific** data itself via domain
hooks (`useExecutions`, `useDeployments`, `useLogs`, …) — react-query de-dupes.

## Rules (short version)

- Type is resolved **once** by `identifyIntegration`; never re-derive it here. No
  `isAutomation` / `isGenericService` / `GENERIC_SERVICE_TYPES` under `overview/`.
- Type-specific code lives in the `<type>/` folder; truly shared chrome in `_shared/`.
  `_shared/` never imports a type folder.
- Shared bodies take **behaviour props**, not type flags.

To add a type, see **Adding a new integration type** below.

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

| Slot                  | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `EnvCardBody`         | content-only body (no Card/header chrome)                            |
| `HeaderStatus`        | left header slot (status dot, Configure)                             |
| `EnvCardActions`      | right header slot (action buttons)                                   |
| `CustomHeader`        | full header override — escape hatch when the header differs a lot    |
| `EnvCardSharedAction` | an action the loader adds in the card's footer, below the body       |
| `CustomOverview`      | full-surface override (type has no env-card concept, e.g. Tailscale) |
| `HeaderActions`       | actions under the page header's Open in Cloud Editor button          |

A type omits any slot it doesn't need — no null-returning placeholders. Bodies shared by
two types live in `_shared/bodies/` and are parameterised by **behaviour props, not type
flags**. See **Structure** above for the concrete layout.

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
file-integration, event-integration, ai-agent, voice-agent, and mcp-server** (the latter shared by
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
