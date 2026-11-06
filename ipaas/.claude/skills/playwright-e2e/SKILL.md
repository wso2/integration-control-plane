---
name: playwright-e2e
description: Write, extend, and debug Playwright end-to-end tests for the ipaas console. Use this whenever the task touches e2e or browser tests, the cloud journey spec, anything under tests/e2e/, pnpm test:e2e, a failing or flaky e2e test, or a request like "add test coverage for the environments page" or "test the import flow" — even when Playwright is never named. Also use it before adding aria-labels or roles to components to make the UI testable.
---

# Playwright e2e tests — ipaas console

## What's in this skill

- `references/locators.md` — how Oxygen UI / MUI components map onto ARIA roles, plus selector traps this suite has already hit. Read it before writing locators for tabs, selects, menus, dialogs, alerts or tables.
- `references/triage.md` — failure messages mapped to their usual causes, and how to tell whether the test or the app is wrong. Read it when a run is red.
- `assets/journey-group-template.ts` — the shape of a new journey group, to copy into the journey spec.

`tests/e2e/AGENTS.md` holds the suite's rules; `tests/e2e/README.md` covers setup, the two sign-in modes and release validation. This skill is the step-by-step workflow.

## Orientation

```text
playwright.config.ts                 projects, retries, artifact settings
.env.test                            credentials (gitignored; template = .env.test.example)
.auth/cloud-user.json                saved session — live credentials, gitignored
.auth/cloud-context.json             { orgHandler, projectHandler } and the run's fixture project
tests/e2e/
  cloud.setup.ts                     signs in through Thunder with the GitHub bot (setup-cloud)
  cloud-token.setup.ts               builds the session from a platform token (setup-cloud-token)
  specs/cloud/ipaas-e2e-journey.spec.ts   the journey: numbered groups 00–09 (project cloud)
  specs/cloud-anon/login.spec.ts          sign-in page, no session (project cloud-anon)
  helpers/
    journey-session.ts               enterOrgHome / enterProject / enterProjectOrSkip, assertSignedIn, refreshSession
    journey-project.ts               the run's fixture project name (activeProject)
    journey-fixtures.ts              shared constants: sample names, timeouts, expected sections
    journey-integrations.ts          integration rows, delete flows, samples tab
    journey-envcard.ts               environment card, deployments, consumers, executions
    console-nav.ts                   sidebar, nav groups, cards, opening projects and integrations
    cloud-fixtures.ts                expectPageRendered, trackFailedRequests, token reseeding
    build.ts                         build status and waitForBuildToSettle
    session-storage.ts               newConsoleContext — every signed-in context goes through it
```

Three facts drive nearly every rule below.

**The suite runs against a deployed console**, never a local dev server. Real latency, real backend state, real Thunder sign-in. Timing assumptions that hold locally do not hold here.

**It is a journey, not a pile of page specs.** One browser context and one page are shared by every group in `ipaas-e2e-journey.spec.ts`. Group 01 creates the run's fixture project (`IPAAS-E2E-<yyMMdd-HHmm>-<suffix>`), later groups use it, group 08 deletes it. Groups run in declaration order and are independent: a failed group skips itself without taking later ones down. New coverage almost always means **a new test inside the right group, or a new numbered group** — not a new spec file.

**The session lives in sessionStorage.** Playwright's `storageState` does not save it, so `newConsoleContext` restores it into every tab. A plain `browser.newContext()` starts signed out. In token mode the session has no refresh token, so long waits must reseed it (`refreshSession`, `reseedHere`).

## The workflow

Work in this order. The most common way an e2e test goes wrong is not a bad assertion — it is a locator that was _invented_ rather than read off the source. It fails on the first run, then gets "fixed" by loosening it into something that passes without checking anything.

### 1. Find the route and the nav path

Routes live in `src/config/routes.tsx`; scope-based URL builders and the navigation registry live in `src/nav.ts`, the rest in `src/paths.ts`. Every signed-in route sits under `/organizations/:org/`. Pages in `src/unported/` have no route — they cannot be tested, and a URL for one falls back to its level's home. Say so rather than writing a test that asserts a redirect by accident.

### 2. Read the page component

Open `src/pages/<Name>.tsx` and follow it into `src/components/`. You are looking for two things.

**Which state the test will land in.** Every page handles loading (a skeleton), error, not-found and empty-listing with early returns. Those are four different DOMs. Decide which one you are testing and make sure the journey puts the fixture project in that state at that point — an empty project before group 04, a populated one from group 06.

**The accessible names.** Headings, button labels, `aria-label`s, placeholders, tab labels. Copy them verbatim, including capitalisation.

### 3. Harvest locators from source, not from imagination

If you are about to type a locator string you have not read in a source file, stop. There are two legitimate exceptions:

- **Third-party pages** — Thunder's hosted sign-in page and GitHub's sign-in screens are not in this repo. Confirm those selectors against a real run (`--headed` or the trace viewer) and comment why the selector looks the way it does, as `cloud.setup.ts` does.
- **Backend-supplied content** — project, integration and org names. Derive them at runtime (`activeProject()`, `getAuthContext()`, or read them back off the page) instead of hardcoding.

If the element has no accessible name, do not reach for a CSS selector. Go to _Making the UI testable_ below.

### 4. Pick the group, then write the test

- Page renders and its states → group **07 page availability** (`expectPageRendered`) or the group that owns the surface.
- A flow on the fixture project → the group whose state it needs (02 empty overview, 04x deploy/test, 05 import, 06 populated overview).
- Something that needs no session → `specs/cloud-anon/`.
- A genuinely new area → a new numbered group placed where the fixture project is in the state it needs. Copy `assets/journey-group-template.ts`.

Shared logic (navigating somewhere, finding a row, waiting for a deployment) goes into the matching `helpers/journey-*.ts` or `console-nav.ts`, not into the spec.

### 5. Run it

A test that has never been run is a draft. Run it before reporting it as done; if you cannot (no `.env.test`, no network), say so plainly rather than implying it passed.

## Locators

Preference order, strongest first:

1. `getByRole('button', { name: 'Import from a Public Repository' })` — what a user and a screen reader perceive; survives restyling.
2. `getByLabel('Display Name')` — form fields.
3. `getByPlaceholder('Search projects')` — when there is no label.
4. `getByText('Start quickly', { exact: true })` — non-interactive copy.
5. A CSS or `nth` selector — last resort, with a comment saying why nothing better exists.

- **`exact: true` when a name is a prefix of another.** `{ name: 'Sign Out' }` matches the menu item and the dialog button; scope to the dialog or use `exact`.
- **Regex for names that vary**, e.g. `/^Import from/` to count providers — but prefer an exact string when the source gives you one.
- **Oxygen UI is MUI underneath**, so components map onto ARIA roles in specific ways — see `references/locators.md`.

## Anatomy of a journey group

```ts
test.describe('07 page availability @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await enterProjectOrSkip(page, orgHandler); // skips the group if the fixture project is missing
  });

  test('TC_IP_SET_004 organization settings offers no unported section', async () => {
    await expectPageRendered(page, `/organizations/${orgHandler}/settings`);
    // Positive assertion first: absences pass on a blank page.
    await expect(page.getByText('Package Registries', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    for (const section of UNPORTED_SECTIONS) {
      await expect(page.getByText(section, { exact: true })).not.toBeVisible();
    }
  });
});
```

- Tests use the shared module-level `page`, not the `{ page }` fixture.
- **Names:** a case id plus a claim about behaviour — `TC_IP_<AREA>_<NNN> <what the user can observe>`. Continue the numbering of the area. The name is what a red release-validation run shows.
- **`@smoke`** goes in every `describe` title.
- **Imports** use the `.js` extension (`'../../helpers/journey-session.js'`) — this is an ESM package.
- **Comments** explain why an assertion exists or why it is shaped that way, as the existing groups do.

## Waiting, and why tests here go flaky

**A URL assertion is not a render assertion.** Routes are lazy-loaded and data arrives through TanStack Query, so `toHaveURL` can pass while the page is still a skeleton. Assert on something the user would see. `expectPageRendered` checks the URL _and_ a heading in `main`.

**Fail fast on a dead session.** If the session expired, the console redirects to Thunder's sign-in page and every content assertion times out for an unrelated reason. The `enter*` helpers call `assertSignedIn`, which throws a clear error instead — reuse them rather than calling `page.goto` yourself.

**Beware conditions that are already true.** A wait for "some heading" resolves instantly if any heading is already on screen. Wait for the specific next state.

**Long waits outlive the token.** Builds and deployments take minutes, and token-mode sessions cannot refresh. Poll in chunks and reseed between them, as `waitForBuildToSettle` and the deployment helpers do. Never wrap a 20-minute wait in one `expect` timeout.

**Never `waitForTimeout`.** Use web-first assertions or a polling helper. If you cannot express the condition, the app needs a testable state indicator — not the test a sleep.

**Assert absence carefully.** `not.toBeVisible()` passes while the page is loading. Assert something visible first.

**Prefer explicit timeouts on the slow assertion** (`{ timeout: 30_000 }`) to raising the global ones. Use `test.setTimeout` for a test that genuinely runs long.

## Fixtures and test data

- **The fixture project** is the run's own. Read its name with `activeProject()`; never hardcode `IPAAS-E2E…`. Everything a group creates lives in it or is named after the run.
- **Clean up by listing, not remembering.** Teardown deletes what the page lists (see `deleteAllIntegrations`), because a worker restarted after a failure has lost its memory.
- **Org handle** comes from `getAuthContext()`.
- **New browser contexts** go through `newConsoleContext(browser, { storageState: AUTH_STATE_PATH, baseURL })`.
- **Unauthenticated tests** belong in `specs/cloud-anon/`, which runs with no session at all.
- **Housekeeping is not a product assertion.** Sweeps (groups 00, 08b) skip with a reason when they cannot finish rather than fail.

## When not to write the test

If a flow is blocked by something outside the repo — an unfinished BFF route, a feature still in `src/unported/`, a third-party page that blocks automation — write `test.skip` with what blocks it and what would unblock it. A test you could not get passing does not earn a skip; investigate it, and if you truly cannot, report it.

## Running and triaging

```bash
pnpm test:e2e                                  # cloud-anon + cloud; loads .env.test
pnpm test:e2e -g "TC_IP_SET_004"               # one test by id
pnpm test:e2e -g "07 page"                     # one group (earlier groups still run their beforeAll needs)
pnpm test:e2e:anon                             # sign-in page only, no credentials
pnpm test:e2e --headed                         # watch the browser
pnpm test:e2e:ui                               # Playwright UI mode
pnpm test:e2e:report                           # last HTML report
E2E_PROJECT=<existing project> pnpm test:e2e -g "<group>"   # run a group against an existing project
```

Token mode: add `E2E_TOKEN_MODE=1` plus `E2E_TOKEN_URL` / `E2E_TOKEN_AUTH` to `.env.test`. If `.env.test` is missing, stop and say so — never invent credentials.

On failure the config keeps a trace, video and screenshot. Read the trace before changing the test; `references/triage.md` maps the messages you will see to their causes. When a locator times out, do not loosen it until it passes — find out what the DOM contains and fix the locator or the app.

## Making the UI testable

Sometimes the fix belongs in `src/`. If a control has no accessible name, a screen-reader user has the same problem your test does, so adding one improves the product.

Prefer, in order: visible text; then `aria-label` on an icon-only control; then a `name`/`id` on a form field. `data-testid` is a last resort — it asserts nothing about usability and drifts silently.

`aria-label={`Settings for ${project.displayName}`}` is a good existing pattern: unique per row, and it carries data the test can read back. Keep the change inside the component, following `ipaas/AGENTS.md`.

## Does the test actually test anything

**It asserts too little.** A loosened locator or an assertion that holds on any page is a permanent green that says nothing. Break each new test on purpose once — change the expected string or hide the element — and watch it fail.

**It never walks the user's path.** `expectPageRendered` jumps straight to a URL; that is right for page availability, and wrong for "does this flow work". For a flow, start where the user starts and click through (open the project from the org home, use the sidebar), asserting the outcome at each step. If the task was a flow, a `goto`-based check does not satisfy it.

## Before calling it done

- Every locator traces to a string in `src/`, a third-party page you verified, or a value derived at runtime.
- Each test asserts something a user would notice, not just a URL.
- You broke each new test once and watched it fail.
- The test sits in the group whose fixture state it needs, and uses the shared `page` and the `enter*` helpers.
- No `waitForTimeout`; absence assertions follow a positive render assertion; long waits reseed the session.
- Nothing hardcodes the org, the fixture project, or a backend-supplied name.
- `pnpm exec eslint tests/e2e playwright.config.ts` is clean, `pnpm exec vitest run tests` passes, and `pnpm exec playwright test --list` loads. `tsc -b` does **not** cover `tests/`.
- The test has actually been run, or you have said plainly why it could not be.
