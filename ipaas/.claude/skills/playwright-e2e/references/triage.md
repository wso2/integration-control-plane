# Triaging a failing e2e run

## Read the trace first

`playwright.config.ts` keeps a trace, video and screenshot on failure. Open the report and the trace before editing anything:

```bash
pnpm test:e2e:report
pnpm exec playwright show-trace test-results/<path-to>/trace.zip
```

The trace answers the only question that matters at this point: at the moment of failure, what was actually in the DOM? Almost every wrong fix comes from skipping this and reasoning from the error message alone.

In release validation the report, traces and videos are uploaded from `/artifacts` to S3; the Job's log tail is in the Google Chat summary.

## Failure patterns

| What you see                                                                | Usually means                                                        | Fix                                                                                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `E2E_GITHUB_USERNAME and E2E_GITHUB_PASSWORD must be set`                   | No `.env.test`, or the GitHub block is empty                         | Fill it in from `.env.test.example`. Stop and ask for credentials rather than inventing them.                             |
| `GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN must be set` | GitHub asked for an emailed code and Gmail is not configured         | Fill in the Gmail variables, or set `E2E_GITHUB_TOTP_SECRET` if the bot has TOTP.                                         |
| `waitForOTP` times out                                                      | Gmail refresh token expired, or the bot has TOTP so no email is sent | `pnpm test:e2e:get-gmail-token`, or set `E2E_GITHUB_TOTP_SECRET`.                                                         |
| Setup stops on a GitHub CAPTCHA or device screen                            | GitHub challenged the bot                                            | Run `--headed`. A CAPTCHA cannot be scripted past; retry later or use token mode.                                         |
| Token setup refuses the token                                               | Token expires too soon, or was issued to another client              | Check `E2E_TOKEN_URL` uses `source=integration-platform`; wait for the provider to rotate.                                |
| `the console redirected to the IdP sign-in page`                            | Session rejected — expired token, or a reseed that did not take      | Delete `.auth/` and re-run. In token mode, check the long wait reseeds between polls.                                     |
| Every group after 01 skips                                                  | The fixture project was not created                                  | Read group 01's failure first; everything later depends on it.                                                            |
| A group fails on a project name it cannot find                              | Group run alone without `E2E_PROJECT`                                | Set `E2E_PROJECT=<existing project>` when running a single group.                                                         |
| Locator times out, trace shows a skeleton                                   | Asserted before render — data still loading                          | Wait on a rendered element, not the URL. Raise the timeout on that one assertion if the environment is slow.              |
| Locator times out, trace shows the element                                  | Name mismatch — casing, whitespace, or a prefix collision            | Copy the accessible name out of the trace; add `exact: true` if it collides.                                              |
| Locator resolves to several elements                                        | Ambiguous name                                                       | Add `exact: true`, scope to a container (`getByRole('dialog')`), or `.first()` with a comment saying why that is correct. |
| Build or deployment wait times out                                          | Slow environment, or the build genuinely failed                      | Check the build status in the trace; a failed build is a product signal, not a timeout to raise.                          |
| Passes locally, fails in release validation                                 | Slower environment, token mode differences, or a missing Job setting | Compare with a local token-mode run; check the Job's environment in `wso2cloud-deployment`.                               |
| A wait resolves instantly and asserts nothing                               | Condition was already true when the wait started                     | Wait for the _next_ state.                                                                                                |
| Absence assertion passes even when broken                                   | Page had not rendered yet                                            | Assert something visible first, then the absence.                                                                         |

## Deciding whether the test or the app is wrong

Before changing a test, ask whether it caught a real regression. Signals that it did: the locator matches current `src/`, the trace shows the element genuinely missing or renamed, or the failure appeared right after a UI or BFF change. Then fix the app or report the bug — do not bend the test to match broken behaviour.

Signals it is the test: the locator never matched the source, it depends on leftovers from another run, or it relies on timing rather than a condition.

## Quarantine, sparingly

If a test is blocked by something outside the repo, `test.skip` it with the blocker and what would unblock it. Never leave a test that passes without asserting anything — a false green also removes the signal that something needs attention.
