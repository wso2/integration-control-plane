# Contexts

> [!NOTE]
> This directory contains React Context providers used across the ICP application. Each context is purpose-built for a specific concern and is intentionally kept narrow in scope.

---

## 1. Access Control Context

**File:** `AccessControlContext.tsx`

### Purpose

This context manages **permission state** for the current user session across three scopes: organisation, project, and component. It provides a unified querying interface so any component in the tree can check whether the user holds a given permission without knowing which scope granted it.

State held (as `Set<string>` collections):

- `orgPerms` — permissions that apply across the whole organisation
- `projectPermsMap` — per-project permission sets, keyed by project ID
- `componentPermsMap` — per-component permission sets, keyed by component ID

Key query methods:

- `hasPermission(permission, projectId?, componentId?)` — returns `true` if the permission exists at any matching scope
- `hasAllPermissions` / `hasAnyPermission` — convenience wrappers for bulk checks
- `isOrgPermissionsLoaded` — lets consumers defer rendering until org-level permissions have been fetched

Scoped `clear*` methods (`clearPermissions`, `clearProjectPermissions`, `clearComponentPermissions`) allow targeted invalidation when the user navigates away from a project or component without wiping unrelated permission state.

#### Why Context

> [!IMPORTANT]
> Permission data is needed by many unrelated parts of the UI (nav items, action buttons, page guards) with no natural parent-child relationship between them. Context distributes this shared read-only state efficiently without requiring a global state library. All mutating callbacks are stabilised with `useCallback` and the value object with `useMemo`, so consumers only re-render when the underlying permission sets actually change.

`useAccessControl()` throws if called outside the provider, enforcing correct usage at the call site rather than silently returning empty results.

---

## 2. Feature Preview Context

**File:** `FeaturePreviewContext.tsx`

### Purpose

This context exposes a **feature-flag map** that controls which preview features are visible to the current user. Flags are toggled at runtime (e.g. from a developer settings panel) and persist across page refreshes via `localStorage` under the key `feature_preview`.

State held:

- `features` — a `Record<string, boolean>` map of feature keys to their enabled state

`updateFeatures(updated)` does a shallow merge, so callers only need to supply the keys they want to change. The merged result is written back to `localStorage` synchronously before the state update is committed.

#### Why Context

> [!IMPORTANT]
> Feature flags are read by scattered, unrelated components — the same reasons as access control apply. Context avoids prop drilling while keeping the flag state reactive. `localStorage` is appropriate here (unlike for sensitive config values) because feature-preview flags are non-sensitive developer preferences that should survive a refresh.

---

## 3. Prebuilt Integration Config Context

**File:** `PrebuiltIntegrationConfigContext.tsx`

### Purpose

This context stores **temporary configuration state** during the prebuilt integration creation flow. The flow spans two routes — a setup page where the user fills in config values, and a deploy page that fires the actual API calls. Because the component does not exist in the database at the setup stage, configs cannot be persisted immediately; they must survive the route transition so the deploy page can submit them as part of a single creation request.

State held:

- `integration` — the selected `PrebuiltIntegration` object (display name, applications, component type, etc.)
- `configValues` — the list of `SchemaConfigItem` values collected from the config form

`clearAll()` is called once deployment succeeds, so the context is wiped before navigating to the new component's overview page.

#### Why Context

> [!IMPORTANT]
> React Context keeps this state **in-memory and scoped to the integration creation flow**, allowing values to survive the `Setup → Deploy` route transition without prop drilling. A `useMemo`-stabilised value object and `useCallback` on `clearAll` prevent unnecessary re-renders.

Other approaches are less suitable:

- **Router/location state** — lost on refresh or direct navigation, making retry flows unreliable.
- **Local storage** — persists longer than needed and is not appropriate for potentially sensitive config values.
- **Global/app-level state** — introduces coupling to an unrelated part of the app.

Context provides the right balance: data is **transient, isolated, and cleaned up as soon as the flow completes**.
