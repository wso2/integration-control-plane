# AGENTS.md — src/api

Every call the console makes to a backend lives here, one file per domain (`projects.ts`, `components.ts`, `environments.ts`, …). UI code reaches these functions only through hooks in `src/hooks/`.

## Clients (`_client.ts`)

- `bff.get | post | put | patch | delete<T>(path, body?)` calls `ipaas-service` at `window.API_CONFIG.choreoBaseApiUrl` with the user's bearer token. A non-2xx response throws a `BffError`:
  - `status` holds the HTTP status;
  - `body` holds the raw body;
  - `message` holds the BFF's own sentence.

  Branch on `status`; show `message` as is; never parse `message`.

- `obsClient.post` calls the observability proxy (`observabilityUrl`) for logs and metrics. It throws an `HttpError` carrying `status`.
- Helpers:
  - `seg(value)` encodes one path segment. Wrap every dynamic segment: `` `/projects/${seg(id)}` ``.
  - `q({ key: value })` builds a query string and drops empty values.
  - `items(response)` unwraps the `{ items: [...] }` list envelope.

Do not call `fetch` directly for BFF or observability requests. Plain `fetch` is only for public, unauthenticated sources, such as the samples and prebuilt catalogs on GitHub.

## Shape of an API file

- **Exports:** functions only, typed with domain types from `src/types/`.
- **Wire types:** BFF types (`BffDeploymentTrack`, …) and the mappers that convert them stay private to the file. Shared mappers go in a `_`-prefixed file such as `_environmentShape.ts`.
- **Org scope:** the access token carries the organization. Do not add org id or org handle parameters that the BFF ignores.
- **Comments:** keep them to what a reader needs: why a mapping exists, or which BFF route a call hits.

## Functions the BFF does not serve yet

Write a typed stub, so the UI that needs it can compile and live in `src/unported/`:

```ts
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] <domain>.${name}: not implemented`));

export const fetchThing = (_id: string): Promise<Thing> => ni('fetchThing');
```

`isUnsupportedError` in `utils/apiErrors.ts` recognises these rejections, so a caller can treat the feature as unavailable rather than broken. When the BFF ships the route, replace the stub with the real call and move its UI out of `src/unported/`.

## Hooks over these functions (`src/hooks/`)

- **Query keys:** arrays that start with the domain name (`['projects']`, `['project', projectId]`). Every value the request depends on is part of the key.
- **Mutations:** invalidate the affected keys in `onSuccess`.
- **Gating:** gate queries on required ids with `enabled`, not with conditionals around the hook.

## Tests

Mappers and other pure logic in an API file get a `*.test.ts` beside it (see `builds.test.ts` and `components.test.ts`). Test the mapping from a BFF shape to the domain type, not the network call.
