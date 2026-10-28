# AGENTS.md — src/unported

Features whose UI exists but whose backend calls the BFF (`ipaas-service`) does not serve yet. Examples are access control, delivery insights, RAG, governance, databases and the Copilot. The code is kept so it can be ported, not run.

## How it is isolated

- The folder mirrors `src/`: `pages/`, `components/`, `hooks/`, `contexts/`, `constants/`, `utils/` and `assets/`.
- **No routes, no navigation entries.** A URL for an unported page falls through to its level's home (`routes.tsx`).
- **One-way imports.** Unported code may import live code. Live code must never import unported code. ESLint enforces both directions, and auth is reached only through `src/auth`.
- Its API functions are typed `ni()` stubs in `src/api/<domain>.ts` (see `src/api/AGENTS.md`).
- It must still type-check and lint, so a change in live code that breaks it must be fixed here too.

## Rules

- Do not add new features here. New work goes in live code once its BFF route exists.
- Keep edits to what live-code changes force: type fixes, renamed imports. Do not refactor or restyle unported code.

## Porting a feature back to live code

1. Confirm the BFF route exists and note its request and response shape.
2. Replace the `ni()` stubs with real calls in `src/api/<domain>.ts`, mapping BFF shapes to domain types.
3. Move the feature's files back to the matching place under `src/` with `git mv`, and fix the imports.
4. Add its route in `src/config/routes.tsx` and its navigation entry in `nav.ts` (or settings section constants).
5. Remove anything that only existed for the stubbed state, such as "unavailable" fallbacks.
6. Run the definition of done in `ipaas/AGENTS.md`, and add the flow to the e2e journey.
