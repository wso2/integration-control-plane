# AGENTS.md — tests/e2e

Playwright tests that run against a **deployed** console: real latency, real backend state, real Thunder sign-in. Setup, running and the container image are covered in [`README.md`](README.md). This file covers how to change the suite. The `playwright-e2e` skill (`.claude/skills/playwright-e2e/`) holds the step-by-step workflow, locator reference and failure triage.

## Layout

```
playwright.config.ts             projects, timeouts, artifact settings (in ipaas/)
tests/e2e/
  cloud.setup.ts                 sign-in through GitHub (project setup-cloud)
  cloud-token.setup.ts           session from a platform-issued token (project setup-cloud-token)
  save-google-session.setup.ts   manual helper for local OAuth work
  get-gmail-token.ts             one-off script that mints the Gmail refresh token
  specs/cloud/ipaas-e2e-journey.spec.ts   the journey (project cloud)
  specs/cloud-anon/login.spec.ts          sign-in page checks, no session (project cloud-anon)
  helpers/                       journey-*, console-nav, build, token, secrets, session-storage, …
```

`E2E_TOKEN_MODE` picks which setup the `cloud` project depends on. Release validation uses `setup-cloud` with the GitHub bot: a token cannot start a console that signs in on the gateway (`AUTH_BFF_CONTEXT`), whose session is a cookie. Both setups write `.auth/cloud-user.json` (session) and `.auth/cloud-context.json` (org and project). Specs cannot tell which setup ran.

## The journey

- **One fixture project, shared context.** `ipaas-e2e-journey.spec.ts` uses a single browser context and a single fixture project. The tests are grouped `01`–`09`; the groups run in order and each one is independent.
- **Fixture project:**
  - Group `01` creates `IPAAS-E2E-<yyMMdd-HHmm>-<suffix>`, and group `08` deletes it.
  - The name is written to `.auth/cloud-context.json`, because Playwright starts a new worker after a failure.
  - Overlapping runs never share a project.
- **The housekeeping group** (`08b`, a sweep of projects older than two hours) skips with a reason instead of failing. Keep it that way: a failed sweep is not a product defect.
- **New coverage** goes into the group for that surface, or a new numbered group. Add a spec file only for a surface that needs a different session or project, as `cloud-anon` does.
- **Teardown** deletes everything a group creates, by listing what exists rather than remembering what was created.
- **Marketing consent prompt.** It is a modal on every signed-in page until the user answers, and it hides the page from role queries while open. It is not shown on the Terms of Use page (`projects/redirect`), so the setup projects' Terms dialog is never under it. The journey's context answers the consent read as already answered (`keepConsentPromptAway` in `helpers/marketing-consent.ts`). Group `07b` has two tests, each in its own context. `TC_IP_MC_001` answers the read as not answered (`answerConsentReadAs`), so the prompt is always tested. `TC_IP_MC_002` reads the e2e user's real record through ipaas-service and checks its status and shape against the console's own mapper. No test records consent: the e2e user's consent is one real Pardot record shared across WSO2 Cloud, so decisions are answered in the browser. Annotate a read's status, never its body.

## Writing tests

- **Locators come from the source.** Every accessible name, label, placeholder and heading must be copied from a file in `src/`, or derived at runtime from backend data. Never guess a locator and loosen it until it passes.
- **Prefer roles.** Use `getByRole`, `getByLabel` and `getByPlaceholder` over CSS. Use `exact: true` when one name is a prefix of another.
- **A URL is not a render.** Routes are lazy and data arrives through TanStack Query, so wait on a rendered element, never on `toHaveURL` alone. Use `expectPageRendered` for page-availability checks.
- **Assert presence before absence.** An absence check passes on a blank page.
- **No fixed sleeps.** Never use `waitForTimeout`. Use web-first assertions, or the polling helpers in `helpers/` for builds and deployments.
- **Open contexts correctly.** Use `newConsoleContext` (`helpers/session-storage.ts`). The cloud session lives in sessionStorage, which `storageState` does not keep, so a plain `browser.newContext()` starts signed out.
- **Long waits.** Tokens last about an hour and token mode has no refresh token. Waits on builds and deployments refresh the session between polls (`refreshSession`, `reseedSessionToken`).
- **Blocked flows** get `test.skip(reason)`. The reason says what blocks the flow and what would unblock it.
- **Names.** Test names are claims about behaviour, prefixed with their case id (`TC_IP_SET_004 organization settings offers no unported section`). `describe` titles carry `@smoke`.
- **Never hardcode the org or project handle.** Read them with `getAuthContext()` and `activeProject()`.

## Credentials

- **Secrets.** Read them with `readSecret()` and type them with `fillSecret()`, never `fill()`. `fill()` records its value in the trace.
- **Setup artifacts.** The setup projects record no trace, video or screenshot unless `E2E_SETUP_ARTIFACTS=1` is set, because a sign-in trace contains tokens.
- **`.auth/` contents** are live credentials. Never commit them, print them or attach them to reports.

## Checks before you finish

`tsc -b` does not cover `tests/`. Run:

```bash
pnpm exec eslint tests/e2e playwright.config.ts
pnpm exec vitest run tests                         # unit tests for the helpers
pnpm exec playwright test --list                   # the suite still loads
pnpm test:e2e -g "<your group or test>"            # against a deployment, when credentials are available
```
