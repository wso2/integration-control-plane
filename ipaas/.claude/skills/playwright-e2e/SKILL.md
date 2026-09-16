---
name: playwright-e2e
description: Write, extend, and debug Playwright end-to-end tests for the ipaas frontend. Use this whenever the task touches e2e or browser tests, Playwright specs, page objects, anything under tests/e2e/, pnpm test:e2e, a failing or flaky e2e test, or a request like "add test coverage for the project home page" or "test the create-integration flow" — even when Playwright is never named. Also use it before adding aria-labels or roles to components for the purpose of making the UI testable.
---

# Playwright e2e tests — ipaas

## What's in this skill

- `references/locators.md` — how oxygen-ui/MUI components map onto ARIA roles, plus the selector traps this suite has already hit. Read it before writing locators for tabs, selects, menus, dialogs, alerts or tables.
- `references/triage.md` — failure messages mapped to their usual causes, and how to tell whether the test or the app is wrong. Read it when a run is red.
- `assets/spec-template.ts`, `assets/PageObjectTemplate.ts` — scaffolds to copy when starting a new file.

## Orientation

```text
playwright.config.ts          testDir, projects, baseURL, timeouts
.env.test                     credentials (gitignored; template = .env.test.example)
.auth/user.json               saved storageState — live session tokens, gitignored
.auth/context.json            { orgHandler, projectHandler } written by setup
tests/e2e/
  global.setup.ts             logs in once via WSO2 Identity Platform, completes onboarding
  helpers/auth-context.ts     getAuthContext() → reads .auth/context.json
  helpers/gmail.ts            waitForOTP() — reads the login OTP from Gmail
  pages/                      page objects, one per page (LoginPage, TopNav, ProjectsPage, …)
  specs/shared/               specs that run against both WIP and cloud
  specs/wip/                  WIP-only specs (Asgardeo login page)
  specs/cloud/                cloud-only authenticated specs
  specs/cloud-anon/           cloud-only specs that need no session
```

Two things about this setup drive nearly every rule below.

**The suite runs against a live deployment, not a local dev server.** `baseURL` defaults to `https://preview-o2-dev.devant.dev`. So tests face real network latency, real backend state, and a real identity provider. Timing assumptions that would hold against a local server do not hold here.

**Auth happens once, in the `setup` project.** It logs in, completes onboarding, saves `storageState` to `.auth/user.json`, and records the org and project handles to `.auth/context.json`. Every spec in the `wip` project starts already signed in and reads its handles from `getAuthContext()`. Handles are per-user and per-run — hardcoding one is always a bug.

## The workflow

Work in this order. The most common way an e2e test goes wrong here is not a bad assertion — it is a locator that was _invented_ rather than read off the source. It fails on the first run, and then gets "fixed" by loosening it into something that passes without checking anything. Reading the source first costs a couple of minutes and avoids that whole trap.

### 1. Find the route

Routes live in `src/config/routes.tsx`; the URL builders live in `src/paths.ts` (`projectHomeUrl`, `componentsNewUrl`, `orgHomeUrl`, …). Reading `paths.ts` is the fastest way to learn the exact URL shape, and its function names tell you what the app calls each surface.

Check whether the route is product-gated. In `routes.tsx`, routes wrapped in `hideable(IS_CLOUD, ...)` are available in the `wip` build (they're redirected away only on cloud); routes added via `IS_CLOUD ? [...] : []` exist only on cloud. The suite runs the `wip` build, so a cloud-only route cannot be tested here — say so rather than writing a spec that 404s.

### 2. Read the page component

Open `src/pages/<Name>.tsx` and follow it into whatever it renders from `src/components/`. You are looking for two things.

**Which state the test will actually land in.** Per `HOUSE_RULES.md` every page handles loading, error, not-found, and empty-listing explicitly, with an early return. Those are four different DOMs. Decide which one you are testing, then pick a fixture that produces it reliably — for example the `default` project is provisioned during onboarding with no integrations, which is exactly why `project-home-empty.spec.ts` uses it to exercise the empty branch.

**The accessible names.** Headings, button labels, `aria-label`s, placeholders, tab labels. Copy them out verbatim, including capitalisation.

### 3. Harvest locators from source, not from imagination

If you are about to type a locator string you have not read in a source file, stop. There are exactly two legitimate exceptions:

- **Third-party pages** — the WSO2 Identity Platform login screens are not in this repo. Confirm those selectors against a real run (`--headed`, or the trace viewer) and comment why the selector looks the way it does, as `global.setup.ts` does.
- **Backend-supplied content** — project names, integration names, org handles. Derive these at runtime instead of hardcoding. `org-overview.spec.ts` does this nicely: it reads the display name out of the gear button's `aria-label` (`Settings for <name>`) and then clicks the matching text, so the test works whatever the project is called.

If the element has no accessible name at all, do not reach for a CSS selector. Go to _Making the UI testable_ below.

### 4. Decide: page object or inline

Add a page object when the surface has navigation plus several elements that more than one spec will touch, or when a multi-step flow needs to be reusable (`CreateProjectPage.fillAndSubmit`). Keep locators inline in the spec when they are used once, in one file — `footer.spec.ts` reads perfectly well without a `FooterPage`.

### 5. Write the spec, then run it

A spec that has never been run is a draft. Run it before reporting it as done, and if you cannot run it (no `.env.test`, no network), say so explicitly rather than implying it passed.

## Locators

Preference order, strongest first:

1. `getByRole('button', { name: 'Create Project', exact: true })` — matches what a user and a screen reader perceive, and survives restyling.
2. `getByLabel('Display Name')` — form fields.
3. `getByPlaceholder('Search projects')` — when there is no label.
4. `getByText('Get Started Quickly')` — non-interactive copy.
5. A CSS or `nth` selector — last resort, and worth a comment saying why nothing better exists.

Notes that matter in practice:

- **`exact: true` when a name is a prefix of another.** `{ name: 'Create' }` also matches "Create Project" and "Create an Integration". `org-overview.spec.ts` uses `exact: true` for precisely this reason.
- **Regex for names that vary**, e.g. `/create project/i` — but prefer an exact string when the source gives you one, since a loose regex is how a test quietly stops asserting anything.
- **oxygen-ui is MUI underneath**, so components map onto ARIA roles in specific ways — a `Select` is a `combobox`, a `Tabs` item is a `tab`, an `Alert` is `role="alert"`. See `references/locators.md` for the mapping; guessing here wastes runs.

## Spec anatomy

```ts
import { expect, test } from '@playwright/test';
import { getAuthContext } from '../../helpers/auth-context.js';

test.describe('<surface> @smoke', () => {
  let orgHandler: string;
  let projectHandler: string;

  test.beforeEach(async ({ page }) => {
    const ctx = getAuthContext();
    orgHandler = ctx.orgHandler;
    if (!ctx.projectHandler) throw new Error('No projectHandler in auth context — re-run setup');
    projectHandler = ctx.projectHandler;

    await page.goto(`/organizations/${orgHandler}/projects/${projectHandler}/home`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForURL(/\/projects\/[^/]+\/home/, { timeout: 30_000 });
  });

  test('<observable behaviour, phrased as a claim>', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'All Projects' })).toBeVisible();
  });
});
```

Conventions worth keeping:

- **Tag smoke suites `@smoke`** in the `describe` title. Nightly CI selects on it.
- **Name tests as claims about behaviour** — `'sign out redirects to login page'`, not `'test signout'`. The name is what a failing nightly run shows you at 2am.
- **Import helpers with the `.js` extension** (`'../../helpers/auth-context.js'`) — this is an ESM `"type": "module"` package. Page objects are imported without it in the existing specs; follow whichever pattern the neighbouring file uses.
- **One spec file per page or surface**, named after it: `project-home.spec.ts`, `top-nav.spec.ts`.
- **Section your file with comment banners** when it covers several groups of behaviour, as the existing specs do. It reads well in review and in the report.

## Page objects

Locators and actions belong in the page object; assertions belong in the spec. The reason is that a page object is a vocabulary — once it starts asserting, two specs that need slightly different assertions end up forking it.

The one accepted exception is a readiness helper: `goto`, `waitForLoad`, `expectPageLoaded` may assert, because "this page finished loading" is the page's own business and every spec needs it identically.

```ts
import { type Page, expect } from '@playwright/test';

export class EnvironmentsPage {
  constructor(private readonly page: Page) {}

  async goto(orgHandler: string) {
    await this.page.goto(`/organizations/${orgHandler}/environments`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  createButton() {
    return this.page.getByRole('button', { name: 'Create Environment', exact: true });
  }

  async expectPageLoaded() {
    await expect(this.page.getByRole('heading', { name: 'Environments' })).toBeVisible();
  }
}
```

Name the file after the page (`EnvironmentsPage.ts`), take `Page` as a private readonly constructor arg, and return locators from zero-arg methods rather than exposing them as fields — that keeps them lazy, so constructing the object never touches the DOM.

## Waiting, and why tests here go flaky

**A URL assertion is not a render assertion.** This is the single biggest trap in this codebase. Routes are lazy-loaded (`lazyPage`) and data arrives through React Query, so `toHaveURL` can pass while the page is still a spinner. Assert on something the user would actually see.

**Race real readiness against the failure mode.** If the session has expired, the app redirects to `/login` and every content assertion times out for a reason that has nothing to do with what you were testing. `project-home-empty.spec.ts` handles this well: it races the expected heading against the login heading, then asserts the URL with a short timeout so a dead session fails in seconds with a clear message instead of burning 30s on content that will never appear.

```ts
await Promise.race([
  page
    .getByRole('heading', { name: 'Create an Integration' })
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => {}),
  page
    .getByRole('heading', { name: 'Sign In' })
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => {}),
]);
await expect(page, 'Session expired or was never authenticated').toHaveURL(/\/projects\/default\/home/, { timeout: 5_000 });
```

**Beware conditions that are already true.** `waitForURL(url => url.pathname.includes('login.do'))` resolves instantly if you are already on `login.do`, so it waits for nothing. Wait for the _next_ state, and when you need to know which of two branches you took, use the `waitForURL(...).then(() => true).catch(() => false)` pattern from `global.setup.ts`.

**Click and navigation are a race.** When a click triggers a cross-domain redirect, wrap both in `Promise.all` with the wait listed first, so you cannot miss the navigation.

**Never `waitForTimeout`.** A sleep either makes the suite slow or makes it flaky, usually both. Use web-first assertions (`expect(...).toBeVisible()` auto-retries) or wait on a specific condition. If you genuinely cannot express the condition, that is a signal the app needs a testable state indicator — not that the test needs a sleep.

**Assert absence carefully.** `expect(locator).not.toBeVisible()` passes trivially while the page is still loading. Wait for something that proves the page rendered _first_, then assert the absence — as `project-home-empty.spec.ts` does before checking there is no table.

**Prefer generous explicit timeouts to raising the global one.** Config gives you 60s per test and 15s per action; slow staging surfaces get `{ timeout: 30_000 }` on the specific assertion that needs it.

## Fixtures and test data

- **Signed-in specs** get `storageState: '.auth/user.json'` from the `wip` project automatically. Read handles from `getAuthContext()`.
- **Unauthenticated specs** opt out explicitly: `test.use({ storageState: { cookies: [], origins: [] } })`, as `login.spec.ts` does for the login and signup pages.
- **The `default` project** is created during onboarding and stays empty — a dependable fixture for empty states.
- **Anything you create needs a unique name**: `e2e-<purpose>-${Date.now()}`. The suite runs `fullyParallel: true`.
- **Need a fresh resource for a whole suite?** Create it once in `beforeAll` using a separate context (`browser.newContext({ storageState: '.auth/user.json' })`) and close that context, as `integrations.spec.ts` does. Do not create it in `beforeEach` — that multiplies backend calls by the number of tests.
- **Never share mutable state between tests.** Parallel workers make ordering assumptions untrue.

## When not to write the test

If a flow is genuinely unstable or blocked — an unfinished UI, an OAuth provider that blocks automation — write `test.skip` with a real explanation of what is blocking it and what would unblock it. This repo does this deliberately (Google OAuth, the create-project flow, unimplemented settings pages) and it is much more useful than either a flaky test or silence, because it documents intended coverage.

```ts
test.skip('Continue with Google — redirects to Google OAuth', async () => {
  // TODO: Google blocks automated OAuth ("This browser or app may not be secure").
  // Needs a service account or OAuth workaround before this can be enabled.
});
```

What earns a skip is an external blocker. A test you could not get passing does not — investigate that instead, and if you truly cannot, report it rather than parking it.

## Running and triaging

```bash
pnpm test:e2e                                        # full suite; loads .env.test
pnpm test:e2e tests/e2e/specs/shared/top-nav.spec.ts  # one file
pnpm test:e2e --headed                               # watch the browser
pnpm test:e2e --grep @smoke                          # by tag
pnpm test:e2e:ui                                     # Playwright's test explorer
pnpm test:e2e:report                                 # last HTML report
```

First-time setup is `cp .env.test.example .env.test` plus `pnpm exec playwright install --with-deps chromium`. Auth needs Gmail API credentials for the OTP — `pnpm test:e2e:get-gmail-token` generates the refresh token once. If `.env.test` is missing, stop and say so; do not invent credentials.

On failure, config keeps a trace, video, and screenshot (`trace: 'retain-on-failure'`). Read the trace before changing the test — it shows the DOM at the moment of failure, which usually answers "was my selector wrong, or was the page not there yet?" in one look. `references/triage.md` maps the failure messages you will actually see to their usual causes.

The instinct to avoid: when a locator times out, do not loosen it until it passes. A test that asserts nothing is worse than a red one, because it also lies. Find out what the DOM really contains and fix the locator or the app.

## Making the UI testable

Sometimes the right fix is in `src/`, not in the test. If a control has no accessible name, a screen reader user has the same problem your test does — so adding one improves the product, which is the only reason it is worth doing.

Prefer, in order: visible text; then `aria-label` on an icon-only control; then a `name`/`id` on a form field. `data-testid` is a last resort — it asserts nothing about whether the UI is usable, and it drifts, because nothing in the app breaks when it disappears.

Make labels unique and stable. `aria-label="Settings for ${project.displayName}"` is a good pattern already in the codebase: unique per row, and it carries data the test can read back. Avoid labels that duplicate another control's name on the same screen, and stay inside the four-layer architecture in `AGENTS.md` — an accessibility label is a UI concern and belongs in the component.

## Does the test actually test anything

A green spec can lie in two distinct ways, and they need different checks.

**It asserts too little.** A locator that was loosened until it passed, or an assertion that would hold on any page, produces a permanent green that tells you nothing. The check is to break it on purpose: change the expected string, or comment out the element in the component, and re-run. If it still passes, it was never asserting what you thought. Do this once for each new spec — it takes a minute and it is the only way to know an assertion has teeth.

**It never walks the user's path.** `page.goto(url)` jumps straight to a page. That is the right default for page-level smoke coverage — it isolates the page under test, keeps the suite fast, and is what most of this suite does deliberately. But it does not exercise how a user actually reaches that page, so if the nav link or button that leads there breaks, the spec stays green.

Be deliberate about which kind you are writing:

- **Page-level** — `goto` the URL, assert the page's content. Cheap, isolated, parallel-friendly. Right for "does this page render its states correctly". `project-home.spec.ts` and `browse-samples.spec.ts` are this.
- **Journey** — start where the user starts and click through, asserting the observable outcome at each step. Slower and more fragile, but it is the only thing that catches broken navigation and wiring. Worth one per critical flow, not one per page. `top-nav.spec.ts` is this: it opens the project picker, selects a project, and asserts the URL changed.

Both are legitimate. What is not legitimate is writing a `goto`-based spec and describing it as covering a flow. If the task was "test the create-integration flow", a page-level spec on the options page does not satisfy it — say so and write the journey, or explain what blocks it.

To see what a spec really did rather than what you think it did, watch the recording: `trace: 'retain-on-failure'` gives you one on failure, and `--headed` shows you a passing run. A journey test that visibly jumps between pages without clicking is not a journey test.

## Before calling it done

- Every locator traces to a real string in `src/`, a third-party page you verified, or a value derived at runtime.
- Each test asserts something a user would notice, not just a URL.
- You broke each new spec on purpose once and watched it fail, so you know the assertions have teeth.
- The spec's kind matches what was asked: page-level for "does this page render", a click-through journey for "does this flow work".
- No `waitForTimeout`; absence assertions are preceded by a positive render assertion.
- Handles come from `getAuthContext()`; created resources have `Date.now()` names.
- The suite is safe to run in parallel and repeatedly — no shared mutable state, no reliance on leftovers from a previous run.
- `pnpm lint` is clean. Note that `tsc -b` does **not** cover `tests/` — `tsconfig.app.json` includes only `src` — so ESLint and Playwright's own transpile at run time are what catch type and syntax errors in specs.
- The spec has actually been run, or you have said plainly why it could not be.
- New page objects hold locators and actions; assertions live in the spec.
