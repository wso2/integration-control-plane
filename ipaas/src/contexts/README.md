# Contexts

> [!NOTE]
> This directory contains React Context providers used across the console. Each context is purpose-built for a specific concern and is intentionally kept narrow in scope.

---

## 1. Access Control Context

**File:** `AccessControlContext.tsx`

### Purpose

This context holds the **permissions of the signed-in user** and lets any component in the tree check them. The access token is scoped to one organization and carries no finer scope, so permissions are granted for the whole organization: `ProtectedRoute` grants the access token's scopes when `SCOPES_ENFORCED` is on (every gated scope when it is off, as ipaas-service then refuses nothing for a missing scope) and the legacy permissions while a session is active, and clears them when it ends. `Scopes` in `constants/permissions.ts` names what the console gates.

State held:

- `orgPerms` — a `Set<string>` of the user's permissions in the organization

Key query methods:

- `hasPermission(permission, projectId?, componentId?)` — returns `true` if the user holds the permission. The project and integration ids are accepted so call sites can state the scope they act in; they do not narrow the check.
- `hasAllPermissions` / `hasAnyPermission` — convenience wrappers for bulk checks
- `isOrgPermissionsLoaded` — lets consumers defer rendering until permissions have been set

#### Why Context

> [!IMPORTANT]
> Permission data is needed by many unrelated parts of the UI (nav items, action buttons, page guards) with no natural parent-child relationship between them. Context distributes this shared read-only state efficiently without requiring a global state library. Callbacks are stabilised with `useCallback` and the value object with `useMemo`, so consumers only re-render when the permission set actually changes.

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

This context stores **temporary configuration state** during the prebuilt integration creation flow. The flow spans two routes — a setup page where the user fills in config values, and a deploy page that fires the actual API calls. Because the integration does not exist in the database at the setup stage, configs cannot be persisted immediately; they must survive the route transition so the deploy page can submit them as part of a single creation request.

State held:

- `integration` — the selected `PrebuiltIntegration` object (display name, applications, component type, etc.)
- `configValues` — the list of `SchemaConfigItem` values collected from the config form

`clearAll()` is called once deployment succeeds, so the context is wiped before navigating to the new integration's overview page.

#### Why Context

> [!IMPORTANT]
> React Context keeps this state **in-memory and scoped to the integration creation flow**, allowing values to survive the `Setup → Deploy` route transition without prop drilling. A `useMemo`-stabilised value object and `useCallback` on `clearAll` prevent unnecessary re-renders.

Other approaches are less suitable:

- **Router/location state** — lost on refresh or direct navigation, making retry flows unreliable.
- **Local storage** — persists longer than needed and is not appropriate for potentially sensitive config values.
- **Global/app-level state** — introduces coupling to an unrelated part of the app.

Context provides the right balance: data is **transient, isolated, and cleaned up as soon as the flow completes**.

---

## 4. Unsaved Changes Context

**File:** `UnsavedChangesContext.tsx`

### Purpose

This context asks the user to confirm before they leave a form they have partly filled in. While any registered form is dirty, it shows an in-app "Leave this page?" dialog for:

- navigations through `useAppNavigate` (which waits on `guardNavigation`);
- clicks on links to another page of the console (a capture-phase document listener; new-tab, modified and download clicks pass through);
- browser back and forward (the popped entry is restored with `history.go`, then replayed on Leave);
- in-page "back" actions wrapped with `useLeaveGuard()`.

Reload and tab close can only show the browser's own `beforeunload` prompt.

Usage:

- `const allowLeave = useUnsavedChanges(isDirty)` — `isDirty` is true when any field differs from its initial value. Call `allowLeave()` right before navigating after a successful save or an explicit Cancel, so that navigation is not prompted.
- `const guardNavigation = useLeaveGuard()` — `guardNavigation(proceed)` runs `proceed` at once when nothing is dirty, otherwise after the user chooses Leave.

The provider is mounted inside the router in `main.tsx`. The click and history decisions are pure functions in `utils/unsavedChanges.ts`.

#### Why Context

> [!IMPORTANT]
> The dirty forms (pages, editors inside a page) and the code that navigates away (sidebar, header switchers, links, the browser) have no common parent below the router. The console uses `<BrowserRouter>`, not a data router, so React Router's `useBlocker` is unavailable. A context lets each form register its dirty flag and lets every navigation path consult one guard and one dialog. Dirty flags live in a ref, so registering does not re-render the tree.
