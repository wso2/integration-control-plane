# Triaging a failing e2e run

## Read the trace first

`playwright.config.ts` retains a trace, video and screenshot on failure. Open the report and the trace before editing anything:

```bash
pnpm test:e2e:report
pnpm exec playwright show-trace test-results/<path-to>/trace.zip
```

The trace answers the only question that matters at this point: at the moment of failure, what was actually in the DOM? Almost every wrong fix in an e2e suite comes from skipping this and reasoning from the error message alone.

## Failure patterns

| What you see                                  | Usually means                                                           | Fix                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `E2E_USERNAME must be set`                    | No `.env.test`                                                          | `cp .env.test.example .env.test` and fill it in. Stop and ask for credentials rather than inventing them.    |
| Setup fails on the Asgardeo page              | The IdP changed its markup                                              | Run `--headed`, inspect, update the locators in `global.setup.ts`.                                           |
| `waitForOTP` times out                        | Gmail token expired or revoked                                          | Re-run `pnpm test:e2e:get-gmail-token`.                                                                      |
| `Not on an org page` from `OrgHomePage`       | Test user has no org                                                    | Sign in manually once and let onboarding provision one.                                                      |
| `No projectHandler in auth context`           | `.auth/context.json` is stale or setup did not reach a project          | Delete `.auth/` and re-run so setup regenerates both files.                                                  |
| Every spec redirects to `/login`              | Saved `storageState` expired                                            | Delete `.auth/user.json` and re-run; setup will log in again.                                                |
| Locator times out, trace shows a spinner      | Asserted before render — data still loading                             | Wait on a real rendered element, not the URL. Raise the timeout on that one assertion if staging is slow.    |
| Locator times out, trace shows the element    | Name mismatch — casing, whitespace, or a prefix collision               | Copy the accessible name out of the trace; add `exact: true` if it collides.                                 |
| Locator resolves to several elements          | Ambiguous name                                                          | Add `exact: true`, scope to a container, or `.first()` with a comment saying why that is correct.            |
| Passes alone, fails in the suite              | Shared state between tests, or a name collision across parallel workers | Give each test its own resources and `e2e-<purpose>-${Date.now()}` names.                                    |
| Passes locally, fails in CI                   | Slower runner, or missing GitHub Actions secrets                        | Check the uploaded `playwright-report` artifact; confirm `E2E_USERNAME` / `E2E_PASSWORD` are set as secrets. |
| A wait resolves instantly and asserts nothing | Condition was already true when the wait started                        | Wait for the _next_ state; use the `.then(() => true).catch(() => false)` branch-detection pattern.          |
| Absence assertion passes even when broken     | Page had not rendered yet                                               | Assert something visible first, then assert absence.                                                         |

## Deciding whether the test or the app is wrong

Before changing a test, ask whether it just caught a real regression. Signals that it did: the locator was correct against current `src/`, the trace shows the element genuinely missing or misnamed, or the failure appeared right after a UI change. In that case, fix the app or report the bug — do not adjust the test to match broken behaviour.

Signals it is the test: the locator never matched the source, it depends on ordering or leftover data, or it relies on a timing assumption rather than a condition.

## Quarantine, sparingly

If a test is genuinely blocked by something outside the repo, `test.skip` it with an explanation of the blocker and what would unblock it. Never leave a test that passes without asserting anything — a false green is worse than a red, because it also removes the signal that something needs attention.
