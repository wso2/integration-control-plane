# E2E Test Suite

Playwright smoke tests for two products built from this one source tree:

| Product                   | Target                                                         | Identity provider | Sign-in                                         |
| ------------------------- | -------------------------------------------------------------- | ----------------- | ----------------------------------------------- |
| **WIP** (formerly Devant) | `https://preview-o2-dev.devant.dev`                            | Asgardeo          | email + OTP, read from Gmail                    |
| **Cloud**                 | `https://ipaas-console-development.gateway.dev.cloud.wso2.com` | Thunder           | GitHub SSO (hosted page, Google or GitHub only) |

The two never share a target: each Playwright project pins its own `baseURL`, so a stray
`E2E_BASE_URL` cannot point the cloud suite at the WIP host or the reverse.

These run against a **live deployment**, not a local dev server. Real latency, real backend state, real identity provider — which is why the conventions below are stricter about waiting than a typical Playwright suite.

---

## Structure

```text
playwright.config.ts             testDir, projects, baseURL, timeouts
.env.test                        credentials (gitignored; template = .env.test.example)
.auth/user.json                  WIP storageState — live session tokens, gitignored
.auth/context.json               WIP { orgHandler, projectHandler }
.auth/cloud-user.json            cloud storageState
.auth/cloud-context.json         cloud { orgHandler, projectHandler }

tests/e2e/
  global.setup.ts                WIP: Asgardeo sign-in + onboarding, saves auth state
  cloud.setup.ts                 cloud: GitHub SSO through Thunder, saves auth state
  cloud-token.setup.ts           cloud: rebuilds the session from a platform-issued token
  save-google-session.setup.ts   optional: saves a Google session for local OAuth work
  get-gmail-token.ts             one-off script to mint the Gmail refresh token
  helpers/
    auth-context.ts              getAuthContext() → the right .auth context for the project
    product.ts                   currentProduct() / isCloud() — derived from the project name
    gmail.ts                     waitForOTP() — reads a code from the bot's Gmail inbox
    totp.ts                      totpCode() via otpauth — GitHub's TOTP second factor
    token.ts                     fetch/decode a platform token, rebuild the console session
    secrets.ts                   readSecret() / fillSecret() — keeps values out of traces
  pages/                         page objects, one per page
    LoginPage.ts  TopNav.ts  OrgHomePage.ts  ProjectsPage.ts
    CreateProjectPage.ts  IntegrationOptionsPage.ts
  specs/
    shared/                      run against BOTH products
      project-home.spec.ts       project home content and breadcrumbs
      project-home-empty.spec.ts empty-state branch (uses the `default` project)
      top-nav.spec.ts            project picker, sign out
      footer.spec.ts             footer links and copyright
      browse-samples.spec.ts     samples listing, search, filter sections
      integrations.spec.ts       currently skipped — create-project flow not final
    wip/                         WIP only
      login.spec.ts              login + signup pages, email/OTP sign-in flow
      org-overview.spec.ts       org home, project cards, navigation — cloud
                                 redirects this page away, see the file header
    cloud/                       cloud only, authenticated
      project-home-entry-points.spec.ts   empty-state entry points; creates its own project
      project-home-populated.spec.ts      integrations table; creates its own project + integration
      deploy-sample.spec.ts               deploy a sample and follow the build it starts
      import-integration.spec.ts          import from a public repo and follow the build
      observability-pages.spec.ts         Logs and Metrics at org, project and integration scope
      settings.spec.ts                    org + project settings, and the cloud sections
    cloud-anon/                  cloud only, NO session required
      login.spec.ts              /login hands off to Thunder's hosted Gate
```

A spec belongs in `shared/` unless the surface genuinely differs between products. Where only an
assertion differs, branch on `isCloud()` inside the spec rather than forking the file — see the
sign-out test in `top-nav.spec.ts`. Where a single test depends on a page one product does not
render, guard it with `test.skip(isCloud(), reason)` instead of moving the whole file — see the
project-picker test in the same file. Move the file only when its entire premise fails, as with
`org-overview.spec.ts`.

### Scenarios covered — cloud console

**Sign-in** (no session required)

- `/login` hands off to Thunder's hosted sign-in page
- Google and GitHub are the only sign-in options offered
- Terms of Service and Privacy Policy links are present
- the GitHub option reaches an OAuth app that can identify the user

**Project home — empty project**

- the URL resolves to the project home and it renders the empty state
- "Create an Integration" and "Import an Integration" cards are shown
- the "Get Started Quickly" panel offers Prebuilt Integrations and Samples tabs
- no integrations table is shown
- all five import providers are offered — Public Repository, GitHub, GitLab, Bitbucket, Azure — and no sixth
- the cloud editor is offered, marked Beta
- the Prebuilt Integrations tab is selected by default and lists cards
- prebuilt cards name the integrations they connect
- the page links to tutorials and Discord support

**Project home — project with integrations**

- the integrations table renders with its Name, Description, Type, Last Updated and Action columns
- every row carries an integration type and a delete action
- the empty-state entry points are replaced, not merely hidden
- the architecture panel renders
- the Integration Types panel totals the rows in the table
- the contributors panel names contributors when the project has any
- searching narrows the table to the matching integration
- a search with no matches empties the table

**Project home — either state**

- the project name is the page heading
- the top nav shows organization and project breadcrumbs
- the page offers to link a repository

**Browse samples**

- the heading, subtitle and search input render
- a Back button returns to the integration creation options
- the Type, Technology and Tags filter sections are shown
- a search with no matches shows the empty-result message, and clearing it restores the results

**Deploying a sample**

- deploying a named sample provisions an integration
- the build card reports a build that has started

The build card's own behaviour is asserted under the import flow instead — it is the same
card, and waiting out two real builds would double the suite's runtime for no extra coverage.

**Importing an integration from a public repository**

- the form resolves the repository URL into a branch, a sub-path and the derived names, the
  identifier stays disabled, the picker lists the repository tree, and importing lands on the
  new integration
- the integration reports its source repository, its type, and a build
- View Logs opens the build logs, with a copy control, and Hide Logs closes them
- the build section collapses and expands
- the build completes

**Logs and Metrics**

- both pages exist and render at organization scope
- both pages exist and render at project scope
- both pages exist and render at integration scope
- no request fails while any of them loads

**Settings**

- the organization settings page exists
- it offers Org Details and Package Registries
- it offers no section that belongs only to the WIP build
- the Package Registries and Org Details pages each render
- the project settings page exists

**Top nav and footer**

- signing out redirects to the login page
- the project picker opens a project's home
- the footer shows Terms of Use, Privacy Policy and Support in that order
- footer links open in a new tab, and the WSO2 copyright notice is shown

Specs that create anything create it themselves and delete it in teardown, so a run leaves the
org as it found it. Teardown empties a fixture project by listing its components rather than by
remembering what it created.

Cloud runs are pinned to two workers, matching what the deployed runners set. The org has a
project quota, and each fixture-creating spec holds one project while it runs — left to pick its
own worker count Playwright takes half the machine's cores and the creates start returning 402.

### Projects

| Project               | Runs                           | Session                            | Credentials needed              |
| --------------------- | ------------------------------ | ---------------------------------- | ------------------------------- |
| `setup`               | `global.setup.ts`              | writes `.auth/user.json`           | WIP account + Gmail             |
| `wip`                 | `specs/shared` + `specs/wip`   | `.auth/user.json`                  | via `setup`                     |
| `setup-cloud`         | `cloud.setup.ts`               | writes `.auth/cloud-user.json`     | GitHub bot                      |
| `setup-cloud-token`   | `cloud-token.setup.ts`         | writes `.auth/cloud-user.json`     | a platform-issued token         |
| `cloud`               | `specs/shared` + `specs/cloud` | `.auth/cloud-user.json`            | via whichever setup is selected |
| `cloud-anon`          | `specs/cloud-anon`             | none                               | **none**                        |
| `save-google-session` | manual helper                  | writes `.auth/google-session.json` | interactive                     |

`cloud-anon` exists so the pre-authentication surface can be tested without any credentials at
all — useful for verifying the cloud target is reachable before the bot account is ready.

### How auth works

**WIP.** The `setup` project runs `global.setup.ts`: it signs in through Asgardeo, reads the email OTP from Gmail, completes onboarding if the account is new, then writes two files.

- `.auth/user.json` — the browser `storageState`, which the `wip` project loads so every spec starts signed in.
- `.auth/context.json` — the `orgHandler` and `projectHandler` for that account, read via `getAuthContext()`.

**Cloud.** `cloud.setup.ts` does the same job through a different flow, as a chain of stage
handlers — each one a no-op when that stage does not appear: `handleTwoFactor`,
`handleOAuthConsent`, `handleOrgOnboarding`, with `assertNoChallenge` throwing a clear error on
GitHub's CAPTCHA / device-verification walls, which cannot be scripted past. The cloud build renders no
in-app sign-in UI at all — `Login.tsx` short-circuits on `IS_CLOUD` and redirects to Thunder's
hosted Gate, which offers Google and GitHub only. The setup clicks _Continue with GitHub_, signs in
with the bot account, answers whichever second factor GitHub presents, and lands back on the
console. Cloud onboarding has no region step: `OrgHome` provisions the `default` project itself and
redirects to its home.

A GitHub identity with no org mapping yet gets Thunder's "create your organization" form (name +
handle) before the redirect back to the console; `handleOrgOnboarding` fills it. Once the org
exists that form never appears again.

GitHub's second factor takes one of two forms, and they are mutually exclusive:

- **TOTP enrolled** — `E2E_GITHUB_TOTP_SECRET` is set and the code is computed locally by `helpers/totp.ts`.
- **No 2FA on the account** — GitHub emails a six-digit device-verification code instead, which `helpers/gmail.ts` reads from the bot's inbox. Nothing beyond the existing Gmail credentials is required.

Enrolling TOTP stops the emails, so set the secret only once the account actually has TOTP.

**Cloud, token mode.** `E2E_TOKEN_MODE` swaps `setup-cloud` for `setup-cloud-token`, which
rebuilds the session from a platform-issued token instead of signing in, so no GitHub credentials
are needed. It writes the same two files, and the specs cannot tell the difference.

The token comes from `E2E_TOKEN_URL` (wso2cloud's `monitoring-token-provider`) with
`E2E_TOKEN_AUTH` sent as `X-Auth-Token`. `E2E_TOKEN_TLS_INSECURE` is needed for that hop: the
internal gateway serves an in-cluster service name no certificate matches.

A token with under five minutes left is refused up front — enough for a read-only run. The
specs that wait out a build take longer than a token's hour, and the session carries no refresh
token, so those poll in chunks and fetch a fresh one between them.

```bash
dotenv -e .env.test -- env E2E_TOKEN_MODE=1 \
  E2E_TOKEN_URL=<provider endpoint> \
  pnpm exec playwright test --project=cloud
```

Both handles are per-account and per-run. **Never hardcode them.** Specs that need to be unauthenticated opt out explicitly:

```ts
test.use({ storageState: { cookies: [], origins: [] } });
```

---

## Prerequisites

**1. Install dependencies**

```bash
cd ipaas
pnpm install
pnpm exec playwright install --with-deps chromium
```

**2. Test account**

Use a dedicated account, never a personal one. The current bot account is `integration-e2e-test-bot@wso2.com`. It must have signed in at least once and have an org, so onboarding has run.

**3. Credentials**

```bash
cp .env.test.example .env.test
```

Then fill in:

| Variable              | Purpose                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `E2E_USERNAME`        | Test account email                                                    |
| `GMAIL_CLIENT_ID`     | OAuth client from Google Cloud Console                                |
| `GMAIL_CLIENT_SECRET` | Same client's secret                                                  |
| `GMAIL_REFRESH_TOKEN` | Generated by the command below                                        |
| `E2E_PASSWORD`        | Only needed if the account falls back to password auth instead of OTP |
| `E2E_BASE_URL`        | Optional — defaults to `https://preview-o2-dev.devant.dev`            |

For the cloud suite:

| Variable                         | Purpose                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `E2E_GITHUB_USERNAME`            | Bot's GitHub username                                                              |
| `E2E_GITHUB_PASSWORD`            | Bot's GitHub password                                                              |
| `E2E_GITHUB_TOTP_SECRET`         | Only if the account has TOTP 2FA — the base32 setup key from enrollment            |
| `E2E_ORG_NAME`, `E2E_ORG_HANDLE` | Optional — pin the org created on a first-ever sign-in (otherwise derived per run) |
| `E2E_CLOUD_BASE_URL`             | Optional — defaults to the development cloud console                               |

Keep the bot out of every GitHub organization. Org-level "require two-factor authentication"
forces 2FA on the account, which removes the emailed device-verification path.

Sign-in uses an email OTP, which the suite reads from Gmail via the API. Mint the refresh token once:

```bash
pnpm test:e2e:get-gmail-token
```

`.env.test` is gitignored. Never commit it, and never commit `.auth/` — it holds live session tokens.

---

## Running

```bash
pnpm test:e2e                                                # WIP suite (shared + wip)
pnpm test:e2e tests/e2e/specs/shared/browse-samples.spec.ts  # one file
pnpm test:e2e --headed                                       # watch the browser
pnpm test:e2e --grep @smoke                                  # by tag

pnpm test:e2e:cloud                                          # cloud suite (shared + cloud + cloud-anon)
pnpm test:e2e:cloud:anon                                     # cloud, no credentials needed

pnpm test:e2e:ui                                             # Playwright test explorer
pnpm test:e2e:report                                         # open the last HTML report
```

`pnpm test:e2e` is pinned to `--project=wip`, so adding cloud projects never widens what the WIP
command runs.

On failure the config retains a trace, video and screenshot under `test-results/`. Open the trace before changing anything — it shows the DOM at the moment of failure, which usually answers "was my selector wrong, or had the page not rendered yet?" immediately.

```bash
pnpm exec playwright show-trace test-results/<path>/trace.zip
```

---

## Writing tests with Claude

The repo ships a Claude Code skill that encodes these conventions, so you don't have to restate them each time.

```text
.claude/skills/playwright-e2e/
  SKILL.md                 the workflow, locator rules, waiting rules, checklist
  references/locators.md   oxygen-ui → ARIA role mapping and selector traps
  references/triage.md     failure messages mapped to causes
  assets/                  spec and page-object scaffolds to copy
.claude/commands/e2e.md    the /e2e slash command
```

Run `claude` from the `ipaas` directory and the skill loads automatically. Either ask in plain English or use the command:

```text
/e2e the create-environment page
/e2e sign-out flow from project home
```

The skill's core rule is that **every locator must trace to a real string in `src/`** — read off the page component, verified against a real run for third-party pages, or derived at runtime for backend-supplied content. A locator that was guessed and then loosened until it passed is the main way an e2e suite ends up green and worthless.

---

## Adding tests by hand

**1. Find the route.** `src/config/routes.tsx`, with URL builders in `src/paths.ts`. Routes wrapped in `hideable(IS_CLOUD, ...)` are available in the `wip` build this suite runs; routes added via `IS_CLOUD ? [...] : []` are cloud-only and don't exist here.

**2. Read the page component.** Per `HOUSE_RULES.md` every page handles loading, error, not-found and empty-listing explicitly. Those are four different DOMs — decide which one you are testing and pick a fixture that produces it. The `default` project is provisioned empty, which is why `project-home-empty.spec.ts` uses it.

**3. Add a page object** in `pages/` if the surface has navigation plus several elements more than one spec will touch. Locators and actions go in the page object; assertions go in the spec, except for a readiness helper like `expectPageLoaded`. Prefer `getByRole` / `getByLabel` / `getByPlaceholder` over CSS.

**4. Write the spec** in `specs/shared/` (or `specs/wip/` / `specs/cloud/` if the surface is product-specific), named after the surface, tagged `@smoke` in the `describe` title. Name tests as claims — `'sign out redirects to login page'`, not `'test signout'`.

**5. Waiting rules that matter here.**

- A `toHaveURL` assertion is **not** a render assertion. Routes are lazy-loaded and data arrives via React Query, so the URL can be right while the page is still a spinner.
- Race real readiness against the failure modes (expired session → `/login`, backend error → error text) so each fails fast with its own message.
- Never `waitForTimeout`. Use web-first assertions, which auto-retry.
- Assert absence only _after_ asserting something visible — otherwise it passes while the page is still loading.

**6. Parallel safety.** `fullyParallel: true`. No shared mutable state; name anything you create `e2e-<purpose>-${Date.now()}`. Need a resource for a whole suite? Create it once in `beforeAll` with its own context, as `integrations.spec.ts` does.

**7. Blocked flows get `test.skip` with a reason** — what is blocking it and what would unblock it. This documents intended coverage honestly, which is better than a flaky test or silence.

**8. Verify.** ESLint covers `tests/`; `tsc -b` does **not** (`tsconfig.app.json` includes only `src`). So:

```bash
./node_modules/.bin/eslint tests/e2e
pnpm test:e2e <your spec>
```

---

## Keeping credentials out of the artifacts

Playwright has **no built-in redaction**. The feature has been requested
repeatedly and remains open ([#19992](https://github.com/microsoft/playwright/issues/19992),
[#27282](https://github.com/microsoft/playwright/issues/27282),
[#31728](https://github.com/microsoft/playwright/issues/31728),
[#38673](https://github.com/microsoft/playwright/issues/38673)), so anything typed
or transferred during sign-in ends up in the artifacts unless the suite prevents
it. Three measures, all verified against a real run:

**1. Secrets are never passed to `fill()`.** `locator.fill()` records its argument
in the trace's action parameters, so a password typed that way is readable by
anyone who opens `trace.zip` — including from the HTML report, which links to it.
`fillSecret()` in `helpers/secrets.ts` sets the value through `evaluate()` and
dispatches `input`/`change` instead, which keeps it out of those parameters. This
is the workaround the upstream issues converge on.

**2. The login records no artifacts by default.** Even without the password, a
trace of the sign-in contains the OAuth token exchange — access and refresh
tokens in a response body. A trace of a passing setup run was checked: password
absent, username absent, tokens present in three entries. So `setup-cloud` sets
`trace`, `video` and `screenshot` to off. `E2E_SETUP_ARTIFACTS=1` turns them back
on to debug a broken login; treat whatever it writes as credential material.

**3. `.auth/` is credential material, not an artifact.** `cloud-user.json` holds a
live browser session for both the console and github.com — a bearer credential
with no second factor in front of it. It is gitignored, excluded from the Docker
build context, and must never be uploaded as a CI artifact.

Two things this does **not** solve, worth knowing before publishing artifacts
anywhere public:

- Traces of the authenticated specs contain the session bearer token in request
  headers, because they record network activity. They stay on
  `retain-on-failure` because that is what makes a failure debuggable — so treat
  the report as internal, and prefer short retention.
- A failing test attaches an `error-context.md` aria snapshot, which records
  input values. Password fields are masked by Playwright there, but a username
  would appear if it were still typed with `fill()`.

---

## Running in a container

The cloud suite ships an image so it can run anywhere without a checkout — a
developer machine, a CI runner, or a Kubernetes Job. It runs the suite against a
**deployed** console; it builds no frontend and serves nothing.

```bash
cd ipaas
docker build -f Dockerfile.e2e -t ipaas-e2e:local .

docker run --rm --env-file .env.test --shm-size=1g ipaas-e2e:local                       # full cloud suite
docker run --rm --shm-size=1g ipaas-e2e:local \
  pnpm exec playwright test --project=cloud-anon                                          # no credentials needed
```

`--shm-size=1g` matters: Chromium's default 64 MB of shared memory in a container
causes renderer crashes that look like random test failures.

The image sets `CI=true`, so a container run picks up the CI half of the config:
two retries, a single worker, and `forbidOnly`. That is deliberate — the image _is_
the CI runner — but it means a container run is not identical to `pnpm test:e2e:cloud`
on your machine.

The container performs its own sign-in — `--project=cloud` depends on
`setup-cloud`, so `.auth/` is created inside the container and no session has to
be mounted in. The test process is PID 1, so **its exit code is the container's**,
which is what a Kubernetes Job uses to decide pass or fail.

## Nightly CI

The workflow at `.github/workflows/e2e-nightly.yml` (in the repo root, above this directory):

- Runs at **2 AM UTC** daily against the `devant-migration` branch
- Can be triggered manually via **Actions → E2E Nightly (WIP) → Run workflow**, picking any branch and target URL

Required GitHub Actions secrets — CI uses these instead of `.env.test`:

| Secret                                                          | Description                                     |
| --------------------------------------------------------------- | ----------------------------------------------- |
| `E2E_USERNAME`                                                  | Test account email                              |
| `E2E_PASSWORD`                                                  | Test account password, if password auth is used |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Needed for OTP sign-in                          |
| `E2E_SLACK_WEBHOOK_URL`                                         | Optional — failure notifications                |

The `e2e-cloud` job in the same workflow runs `--project=cloud-anon --project=cloud` and needs:

| Secret                                                          | Description                                      |
| --------------------------------------------------------------- | ------------------------------------------------ |
| `E2E_GITHUB_USERNAME`, `E2E_GITHUB_PASSWORD`                    | Bot's GitHub credentials                         |
| `E2E_GITHUB_TOTP_SECRET`                                        | Only if the bot has TOTP 2FA                     |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Reused — reads GitHub's device-verification mail |

The two jobs are independent: a cloud failure does not fail the WIP job.

GitHub disables scheduled workflows on forks, and only runs schedules from the repository's default branch.

---

## Troubleshooting

See `.claude/skills/playwright-e2e/references/triage.md` for the full table. The common ones:

| Symptom                                                   | Cause                                                        | Fix                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `E2E_USERNAME must be set`                                | No `.env.test`                                               | `cp .env.test.example .env.test` and fill it in                            |
| `waitForOTP` times out                                    | Gmail refresh token expired or revoked                       | `pnpm test:e2e:get-gmail-token`                                            |
| Setup fails on the Asgardeo login page                    | The IdP changed its markup                                   | Run `--headed`, inspect, update the locators in `global.setup.ts`          |
| `Not on an org page`                                      | Test account has no org                                      | Sign in manually once and let onboarding provision one                     |
| `No projectHandler in auth context`                       | `.auth/context.json` stale, or setup never reached a project | Delete `.auth/` and re-run                                                 |
| Every spec redirects to `/login`                          | Saved `storageState` expired                                 | Delete `.auth/user.json` and re-run                                        |
| Locator times out, trace shows a spinner                  | Asserted before render                                       | Wait on a rendered element, not the URL                                    |
| Locator times out, trace shows the element                | Name mismatch or prefix collision                            | Copy the name from the trace; add `exact: true`                            |
| Passes alone, fails in the suite                          | Shared state or name collision across workers                | Per-test resources with `Date.now()` names                                 |
| Passes locally, fails in CI                               | Slower runner, or missing secrets                            | Check the uploaded `playwright-report` artifact                            |
| `E2E_GITHUB_USERNAME and E2E_GITHUB_PASSWORD must be set` | Cloud credentials absent                                     | Fill the cloud block in `.env.test`, or run `pnpm test:e2e:cloud:anon`     |
| Cloud setup stalls on a GitHub screen                     | GitHub asked for a factor the setup does not handle          | Run `--headed`; if it is a passkey prompt, remove the passkey from the bot |
| `waitForOTP` times out during cloud setup                 | Bot has TOTP enrolled, so no mail is ever sent               | Set `E2E_GITHUB_TOTP_SECRET`                                               |
| Cloud specs redirect to Thunder's Gate                    | `.auth/cloud-user.json` expired                              | Delete it and re-run                                                       |
