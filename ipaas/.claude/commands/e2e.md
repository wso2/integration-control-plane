---
description: Write or extend Playwright e2e tests for a page or flow
argument-hint: <page, flow, or test id>
---

Write end-to-end test coverage for: **$ARGUMENTS**

Follow the `playwright-e2e` skill in `.claude/skills/playwright-e2e/` — read it first, including `references/locators.md` before writing any locator, and `tests/e2e/AGENTS.md` for the suite's rules.

Work in this order and do not skip ahead:

1. Locate the route in `src/config/routes.tsx` and its URL builder in `src/nav.ts` or `src/paths.ts`. If the page lives in `src/unported/`, it has no route — say so and stop.
2. Read the page component under `src/pages/` and whatever it renders from `src/components/`. Identify which state (loading skeleton / error / not-found / empty / populated) the test needs, and which point of the journey puts the fixture project in that state.
3. Harvest accessible names verbatim from that source. Every locator must trace back to a real string you read, a third-party page you verified against a real run, or a value derived at runtime.
4. Add the test to the matching group in `tests/e2e/specs/cloud/ipaas-e2e-journey.spec.ts`, or a new numbered group from `assets/journey-group-template.ts`. Only sign-in-page checks that need no session go in `specs/cloud-anon/`. Put reusable steps in `tests/e2e/helpers/`.
5. Name it `TC_IP_<AREA>_<NNN> <observable behaviour>`, continuing the area's numbering; keep `@smoke` on the group title.
6. Check and run:
   - `pnpm exec eslint tests/e2e playwright.config.ts`
   - `pnpm exec playwright test --list`
   - `pnpm test:e2e -g "<test id>"` — GitHub sign-in by default; add `E2E_TOKEN_MODE=1` with `E2E_TOKEN_URL` / `E2E_TOKEN_AUTH` in `.env.test` for token mode
   - `pnpm test:e2e:anon` — for `cloud-anon` tests

Then report back with: where the test went and why, which behaviours it asserts, anything left as `test.skip` and why, and the actual run result. If you could not run it, say so plainly rather than implying it passed.
