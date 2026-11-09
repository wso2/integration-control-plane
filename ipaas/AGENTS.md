# AGENTS.md — ipaas console

The WSO2 Integration Platform console: a React single-page app that talks to one backend-for-frontend (BFF), `ipaas-service`, and signs users in through Thunder, the WSO2 Cloud identity provider. [`docs/architecture.md`](docs/architecture.md) describes the moving parts.

Stack: Vite 7, React 19, React Router 7, TanStack Query 5, TypeScript 5, `@wso2/oxygen-ui` (MUI based), Vitest 4, Playwright, pnpm.

## Commands

Run from `ipaas/`. Use Node.js 20 or later; the unit tests fail on Node 18.

| Task                 | Command                                      |
| -------------------- | -------------------------------------------- |
| Install              | `pnpm install`                               |
| Type-check and build | `pnpm build:check` (`tsc -b && vite build`)  |
| Build only           | `pnpm build`                                 |
| Build under a prefix | `BASE_PATH=/integration-platform pnpm build` |
| Lint                 | `pnpm lint`                                  |
| Unit tests           | `pnpm test:unit`                             |
| One unit test file   | `pnpm exec vitest run src/utils/foo.test.ts` |
| E2E suite            | `pnpm test:e2e` (see `tests/e2e/AGENTS.md`)  |

`pnpm dev` runs against the dev environment: it proxies `/_auth` and `/_api` to the deployed dev console's gateway and signs in with that console's session cookies, copied onto `https://localhost:3000`. [`docs/runtime-config.md`](docs/runtime-config.md) ("Running `pnpm dev`") has the steps, and `DEV_PROXY_TARGET` points it at another console. Every change made there is real, so test with your own projects and data. To try a change without touching a shared environment, deploy it to the local WSO2 Cloud stack described in the [local setup guide](https://docs.google.com/document/d/1El3uqR674ZDjLfbEP3VSQZgGxYjQMK0kfxQakc9Lh_s).

## Project map

```
src/
  api/          BFF calls, one file per domain        → src/api/AGENTS.md
  auth/         Thunder sign-in and tokens            → src/auth/AGENTS.md
  hooks/        TanStack Query hooks over api/
  pages/        One component per route
  components/   Shared and feature components
  layouts/      AppLayout (signed-in shell), PublicLayout, ProtectedRoute
  config/       routes.tsx (all routes), runtimeConfig.ts (reads /config.json)
  nav.ts        Scope model (org → project → integration), navigation registry, URL builders
  paths.ts      URL builders for flows outside the scope model
  contexts/     Narrow React contexts (see its README.md)
  types/        Domain types shared by api/, hooks and UI
  utils/        Pure functions, tested in a *.test.ts next to each file
  services/     Client-side services (AI Integration Builder pipeline)
  unported/     Features the BFF cannot serve yet      → src/unported/AGENTS.md
public/config.json   Runtime config for the local stack (docs/runtime-config.md)
tests/e2e/           Playwright suite                  → tests/e2e/AGENTS.md
```

All signed-in routes live under `/organizations/:org/`. The org handle comes from the URL and the session; never hardcode it.

## Architecture rules

- **Layering:** pages and components → `hooks/` → `api/` → `auth/`. A page or component never imports from `api/` directly.
- **Auth:** import auth only from `src/auth` (its `index.ts`). ESLint rejects imports of files inside it.
- **Unported code:** nothing outside `src/unported/` imports from it. ESLint enforces this.
- **URLs:** build every in-app URL with the helpers in `nav.ts` or `paths.ts`. No route strings in components.
- **Base path:** the console can be served under a path prefix (`BASE_PATH` build arg → Vite `base`, default the root).
  The router's basename covers router-relative code, so only window-level URLs — `window.open`, `window.location`,
  `new URL`, and pathname comparisons — go through `withBase` / `stripBase` in `src/utils/basePath.ts`.
- **Browser storage:** read and write it through `src/utils/storage.ts`, which prefixes this console's keys. The
  console shares one origin with the other WSO2 Cloud consoles, so unprefixed names collide with theirs.
- **Runtime config:** read backend URLs from `window.API_CONFIG`, never from `import.meta.env`. New keys go through `src/config/runtimeConfig.ts` and `docs/runtime-config.md`.

## Code rules

**Page states**

- Handle loading, error, not-found and empty-listing states explicitly, each with its own UI.
  - Loading: show a skeleton (see below).
  - Error: show an error state with a retry action.
  - A required entity that is missing after loading: show a not-found state (`PageNotFound`).
  - An empty listing: show an empty-listing state that says what is missing and offers the next action.
- Handle each state with an early `return` at the top of the component, before the main view. Once those checks have passed, the data is known to be there, so the main view needs no `?.`, `??` or `!` on it:

  ```tsx
  if (isLoading) return <ProjectHomeSkeleton />;
  if (isError)
    return (
      <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
        Could not load the project.
      </Alert>
    );
  if (!project) return <PageNotFound title="Project not found" />;
  return <ProjectHome project={project} />; // project is defined from here on
  ```

**Loading skeletons**

- Prefer skeletons to spinners. Use `Skeleton` from `@wso2/oxygen-ui`, shaped like the content it stands in for: same layout, rows and card sizes. The page then does not jump when data arrives.
- **Page loading:** a page-level skeleton that mirrors the page's layout, in its own component (for example `IntegrationOverviewSkeleton`).
- **Content loading:** when only part of a page is waiting (a table, a card, a panel), skeleton that part and render the rest.
- Keep spinners (`CircularProgress`) for short actions in place, such as a button that is saving, and for the route-level `Suspense` fallback.

**Types and effects**

- Do not paper over missing values (`name ?? ''`, `x!.y`, `x ? … : null`). Make the bad state impossible through types or a guard.
- Use an effect only to synchronise with an external system. Derived state and event handling do not need one.

**Components and styling**

- Use the component that fits the job. Do not wrap everything in `Box`.
- Inline `sx` is for small one-off styles only.
  - Hoist static `sx` objects to module scope with `as const`.
  - Move styles into a co-located `<name>.styles.ts` of named `as const` objects once any of these holds:
    - the file has more than about five `sx` usages;
    - one `sx` object has more than about six properties;
    - the same style repeats.
  - Keep only prop- or state-driven `sx` inline.
  - Use `styled()` for reusable structural wrappers.

**Wording and formatting**

- **Wording:** the third navigation level is an **Integration**. Never call it a "Component" in UI copy, comments or docs. Code identifiers such as `componentId` stay as they are.
- **Formatting:** Prettier and ESLint configs are in the repo. Format only the lines you change. Some upstream files are not Prettier-clean, and reformatting them buries the real diff.

## Oxygen UI guidelines

The console is built on `@wso2/oxygen-ui`, and its guidelines are binding. The installed package ships them:

- `node_modules/@wso2/oxygen-ui/.ai/` — `AGENTS.md` (critical rules), `components.md` (API), `patterns.md`, `theming.md`.
- `node_modules/@wso2/oxygen-ui/.claude/skills/` — `oxygen-component`, `oxygen-form` and `oxygen-layout`. These hold the rules for tables, toolbars, containers and UI text.

Read the guideline for the kind of UI you are changing before you change it. Where this file is stricter, follow this file. The rules below are the ones changes most often break:

- **Components:** import components from `@wso2/oxygen-ui` and icons from `@wso2/oxygen-ui-icons-react`, never from `@mui/*`.
  - Use the Oxygen component when one exists: `DrawerPanel`, `ListingTable`, `ListingCard`, `PageTitle`, `PageContent`, `RelativeTime`, `SearchBar`.
  - Use theme tokens, never hardcoded colours or pixel spacing.
- **UI text:** write every title, heading, button, link, menu item, tab, label, placeholder, table column, tooltip and message in sentence case: "Create project", "Last updated".
  - Capitalize only the first word, proper nouns, product names and acronyms.
  - Never change case with `textTransform: 'uppercase'` or `'capitalize'`; write the text in the case it should show.
- **Search:** search is always visible.
  - Its placeholder names what is searched ("Search projects", "Search by name"). Never use a bare "Search" or a trailing ellipsis.
  - The placeholder doubles as the field's `aria-label` (see `SearchField`).
  - A list or grid page search uses `width="standard"`: 400px, shrinking in narrower containers. Never stretch it across the page.
  - Searches inside a drawer, dialog, menu or side panel fill their container with `fullWidth`.
- **Inputs and forms:** use `TextField` with `labelPlacement="top"`, and mark optional fields with `optional`. Required asterisks are hidden globally.
  - Show validation with `error` and `helperText`.
  - Group long forms into titled sections.
  - Guard every editable page, drawer and dialog with `useUnsavedChanges`.
- **Containers:** pick the lightest container that fits: modal, then right drawer, then page form, then full-page wizard. The `oxygen-component` skill, "Choosing a container", gives the rules.
  - A modal holds one decision or one to three fields and never scrolls.
  - A modal's title states the action, and its buttons use specific verbs, never "OK" or "Yes".
  - A destructive modal confirms with danger styling. A high-impact delete also asks for the resource name (`ConfirmDeleteDialog`).
  - Never nest modals, stack drawers or use `window.confirm`, `alert` or `prompt`.
- **Toolbars:** keep this order: scope, search, filters, then view toggles, utility icons, secondary actions and one filled primary action at the right.
  - Lay the row out `space-between`: search on the left, the other controls grouped on the right (see `LogsToolbar`).
  - Put the result count in the footer.
  - Every icon button has a `Tooltip` and an `aria-label`.
- **Page layout:** wrap every page, including its loading, error and not-found states, in `<PageContent fullWidth>`.
  - Head the page with `PageTitle` (`PageTitle.Header`, with `PageTitle.Actions` for the page's main actions), never a hand-sized `Typography`.
  - A page reached from another one starts with a text Back button above the title, labelled with where it goes: "Back to project", "Back to projects".
- **Form actions:** put the buttons in a row below the form: Cancel first, then the primary action to its right ("Create", "Update project").
  - Cancel is `variant="outlined" color="inherit"`, so it stays neutral; only the primary action uses the primary colour.
  - Disable both while the request runs, and show a `CircularProgress` with a verb in progress ("Creating…") on the primary button.

## Boundaries

- Never commit `.env.test`, `.env.local`, `.auth/` or real credentials in `public/config.json`.
- Never print access tokens, refresh tokens or secrets in logs, test output or messages.
- Do not edit the BFF (`ipaas-service`) or deployment repositories from here. Note what they need instead.
- Do not stage with `git add -A` or `git add .`; stage the files you changed.

## Definition of done

1. `pnpm build:check` passes.
2. `pnpm lint` reports no errors.
3. `pnpm test:unit` passes, including new tests for new logic in `utils/` or `api/`.
4. User-facing flows you changed are covered by, or still pass, the e2e journey.
5. Docs touched by the change are updated (this file, a nested `AGENTS.md`, `README.md` or `docs/`).

## After a code change

When you finish a task that changed code, end your reply with one line offering the review, for example:

> Run `/review-changes` to review these changes against AGENTS.md, get a shareable review, apply the fixes you pick and get a commit message.

Do not start the review yourself. It runs only when the user asks (`.claude/skills/review-changes/`, a Claude Code skill).
