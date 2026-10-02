# src/api/wip/ — wip Implementation Notes

This file covers implementation details **specific to the wip product**. For the general API layer rules (what belongs in the API layer, the product-switching mechanism, and how to add a new function across all products) see `src/api/AGENTS.md`.

---

## Transport tiers

```text
auth/wip/tokenManager.ts         authenticatedFetch — token injection, 401 refresh
        ↓
api/wip/httpClients.ts       createHttpClient factory, named clients, retry helpers
api/wip/graphql.ts           gql() helper — wraps the single GraphQL endpoint
        ↓
api/wip/<domain>.ts          Named service functions
```

---

## 403 handling

Two retry helpers are exported from `httpClients.ts`. Domain files use these instead of calling `authenticatedFetch` directly:

| Helper               | When to use                                                                         |
| -------------------- | ----------------------------------------------------------------------------------- |
| `withStsRetry(fn)`   | Token is unscoped (no org UUID); STS configured. Refreshes token then retries once. |
| `withScopeRetry(fn)` | APIM scope validation error (code 900910). Refreshes token then retries once.       |

`createHttpClient()` also accepts an `on403` callback for client-level custom handling.

---

## Known deviations from standard client usage

Only one domain file calls `authenticatedFetch` directly. All other 403 retry cases are handled via `withStsRetry`/`withScopeRetry`.

| File         | Function             | Reason                                                                                                           |
| ------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `copilot.ts` | `getAiCopilotAnswer` | Caller-provided URL, streaming `Response`, and custom per-request headers — incompatible with `createHttpClient` |

`graphql.ts` and `httpClients.ts` also call `authenticatedFetch` internally — those are transport-layer files, not domain files, so this is expected.

---

## Adding a new service function to wip

1. Add the function to the appropriate `src/api/wip/<domain>.ts` using the relevant named client from `httpClients.ts`.
2. Add a matching stub to `src/api/cloud/<domain>.ts` and `src/api/icp/<domain>.ts` — same function name, body throws `ni('<functionName>')`.
3. Write input and return types in `src/types/` — domain files must not define types that belong in the shared types layer.
4. Update the relevant interface in `src/api/contracts.ts` with the new signature. The `_check.ts` files in each product will fail to compile if any product's signature drifts.
5. If the endpoint can return 403 due to token scope, wrap with `withStsRetry` or `withScopeRetry`.
6. Do **not** write a `useQuery`/`useMutation` wrapper here — that goes in `src/hooks/`.

### If it is a new domain file

1. Create `src/api/wip/<domain>.ts` with the real implementation.
2. Create `src/api/cloud/<domain>.ts` and `src/api/icp/<domain>.ts` stubs (`ni()` pattern).
3. Add a new `<Domain>Api` interface in `src/api/contracts.ts` and wire it into the `AppApi` aggregate.
4. Add the matching `import * as <domain>` + `const _<domain>: Contracts.<Domain>Api = <domain>` assertion to all three `_check.ts` files.
5. Hooks import via `'#api/<domain>'` — no additional wiring needed.

---

## GraphQL inline queries

Some mutations are built with string interpolation rather than variables (e.g. `createComponent`, `fetchReleaseMgtDeployments`). Always use the local `gqlStr()` / `esc()` helpers for user-supplied values to avoid injection. Never concatenate raw strings into a GraphQL query without escaping.

---

## GraphQL response → domain mapping

The general mapping rule (raw wire shape → `src/types/*` domain type) is documented in `src/api/AGENTS.md`. This section covers what that looks like in `wip/` specifically.

### Today: mostly pass-through

Most wip GraphQL responses already match the domain shape, so the function reads:

```ts
export async function fetchComponents(orgHandler: string, projectId: string): Promise<Component[]> {
  return gql<{ components: Component[] }>(COMPONENTS_QUERY, { orgHandler, projectId }).then((d) => d.components);
}
```

Here `gql<{ components: Component[] }>` simply declares the expected wrapper, and the domain type `Component` is reused directly because the GraphQL field names happen to match. **No private raw type is needed.** Add one only when the wire shape diverges from the domain shape.

### When you need an explicit mapper

Some GraphQL responses already use snake_case or restructured fields (e.g. `fetchReleaseMgtDeployments` returns `release_mgt_id`, `environment_id`, `component_configs.config_mapping_revision`, …). For these:

1. Declare a private raw type inside the wip file, mirroring the wire shape exactly:
   ```ts
   interface RawReleaseMgtDeployment {
     id: string;
     release_mgt_id: string;
     environment_id: string;
     component_configs: { config_mapping_revision: number /* … */ };
     // …
   }
   ```
2. Write a private `toReleaseMgtDeployment(raw)` mapper that translates field names and reshapes nested objects to match the domain type.
3. Return domain types from the exported function:
   ```ts
   export async function fetchReleaseMgtDeployments(...): Promise<ReleaseMgtDeployment[]> {
     const data = await gql<{ componentReleaseMgtDeployments: { deployments: RawReleaseMgtDeployment[] } }>(QUERY, vars);
     return (data.componentReleaseMgtDeployments?.deployments ?? []).map(toReleaseMgtDeployment);
   }
   ```

Today some of the snake_case responses leak through to consumers because the domain type itself was shaped to match the wire (a known cleanup item). When migrating one of these to a proper mapper, also update the domain type in `src/types/` to use idiomatic camelCase — components and hooks then need their property access updated. Do this one domain at a time and lean on `tsc` to catch every call site.

### Where mappers must NOT go

- **Not in `src/types/`** — those are pure domain types.
- **Not in `src/hooks/`** — hooks consume already-normalized domain types.
- **Not in components/pages** — by the time data reaches the UI, it must already be domain-shaped.
