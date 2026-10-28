---
name: review-changes
description: Review and tidy the current code changes in the ipaas console before they are committed — check them against the repo's AGENTS.md rules, look for bugs, redundancy, misplaced code and noisy comments, run the validation checks, publish the findings as a shareable review, apply the fixes the user approves, and finish with a commit message. Run it when the user types /review-changes or asks to "review my changes", "check my fixes before I commit", "refactor and review what I just did", or "is this ready to commit". Never start it on your own; at the end of a coding task, offer it in one line instead.
argument-hint: '[base ref, e.g. upstream/devant-migration — defaults to uncommitted changes]'
---

# Review changes — ipaas console

A review pass over the changes a developer has just made, run only when they ask. It ends in three things: a shareable review, the fixes they chose applied, and a commit message.

The user typing `/review-changes` (or asking for a review) is the permission to run. Do not run it otherwise.

## 1. Work out what to review

- **No argument:** the uncommitted changes — `git status --short`, `git diff HEAD`, and the content of untracked files under `ipaas/`.
- **A base ref** (`/review-changes upstream/devant-migration`): everything on the branch since it — `git diff <base>...HEAD` plus uncommitted changes.

List the changed files and say in one line what you are about to review. Skip generated and vendored files (`pnpm-lock.yaml`, `dist/`, snapshots) unless they changed unexpectedly.

If there is nothing to review, say so and stop.

## 2. Load the rules for the touched code

Read `ipaas/AGENTS.md`, then the nested `AGENTS.md` of every folder the diff touches (`src/api/`, `src/auth/`, `src/unported/`, `tests/e2e/`). These are the review criteria; cite them in findings.

## 3. Review

Read each changed hunk with enough surrounding code to understand it — open the whole file when a hunk changes behaviour. Look for:

| Area                | What to check                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Correctness**     | Logic errors, wrong conditions, missing awaits, stale closures, unhandled promise rejections, effects with wrong dependencies, query keys missing a value the request depends on, mutations that do not invalidate.          |
| **AGENTS.md rules** | Layering (pages → hooks → api → auth), auth imported only from `src/auth`, no imports from `src/unported` in live code, URLs only from `nav.ts` / `paths.ts`, runtime config only via `window.API_CONFIG`.                   |
| **Page states**     | Loading uses a skeleton shaped like the content; error has a retry; not-found and empty-listing states exist; early returns before the main view; no `?.` / `??` / `!` papering over data that should already be guaranteed. |
| **Redundancy**      | Dead code, unused parameters, props or exports, duplicated logic that an existing helper already covers, constants defined twice, state that could be derived, effects that are not synchronising with anything external.    |
| **Placement**       | Utils, types and constants in the right folder (`utils/`, `types/`, `constants/`), not buried in a component; shared logic not copied between files; `sx` hoisted or moved to `.styles.ts` per AGENTS.md.                    |
| **Comments**        | Keep only comments that explain a non-obvious _why_, in one line. Flag comments that restate the code, narrate the change ("now we…", "fixed…"), or reference tickets, sessions or old behaviour.                            |
| **Tests**           | New logic in `utils/` or `api/` has a `*.test.ts`; changed behaviour has its tests updated; e2e changes follow `tests/e2e/AGENTS.md`.                                                                                        |
| **Wording**         | UI copy, comments and docs say **Integration**, not "Component", for the third level.                                                                                                                                        |
| **Safety**          | No tokens, secrets or real credentials in code, config, logs or tests; no `.env*` or `.auth/` files in the change.                                                                                                           |
| **Formatting**      | Only changed lines reformatted — whole-file reformatting of an untouched upstream file buries the real diff.                                                                                                                 |

Then **verify every finding** before reporting it: re-read the code, check callers with a search, and drop anything you cannot confirm. Give each one:

- **Severity:** `must-fix` (bug, rule violation, security), `should-fix` (redundancy, placement, missing test), `nit` (comment, naming, small style).
- **Location:** `path:line`.
- **What and why:** one or two sentences, citing the AGENTS.md rule when one applies.
- **Fix:** the concrete change, as a short snippet when it helps.

## 4. Run the checks

From `ipaas/`, on Node.js 20 or later:

```bash
pnpm exec tsc -b
pnpm exec eslint <changed .ts/.tsx files>
pnpm exec prettier --check <changed files>
pnpm test:unit
```

Add `pnpm exec eslint tests/e2e playwright.config.ts` and `pnpm exec playwright test --list` when `tests/e2e/` changed, and `pnpm build` when routes, config or dependencies changed.

For a Prettier failure, check whether the file was already unformatted at `HEAD` (`git show HEAD:<path> | pnpm exec prettier --stdin-filepath <path> --check`). If it was, report it as pre-existing and do not ask to reformat it.

Record each check as passed, failed (with the shortest decisive error line) or skipped (with the reason).

## 5. Publish the review

Publish the review as a shareable page with the Artifact tool, so it can be sent to a teammate or reviewer. Load the `artifact-design` skill first. The page holds:

1. **Verdict** — "Ready to commit", "Ready after fixes" or "Needs work", with counts per severity.
2. **Scope** — branch, base, and the changed files.
3. **Checks** — a table of each check and its result.
4. **Findings** — grouped by severity, each with its location, explanation and suggested fix.
5. **Looks good** — a short list of what the change does well, only where it is specific and true.

Never put tokens, secrets, `.env` contents or personal data on the page. If the Artifact tool is not available, write the same content to `review-changes.md` in the scratchpad (never in the repo) and give the path.

Give the link in the chat with a two-line summary — the verdict and the must-fix count.

## 6. Apply the fixes the user chooses

Ask which findings to apply: all, only `must-fix`, a chosen list, or none. Then:

- Apply only the chosen fixes. Do not widen the change beyond them.
- Re-run the checks from step 4 that the fixes affect, and report the results honestly — a failing check stays reported as failing.
- If a fix turns out wrong or risky while applying it, stop and say so instead of forcing it.
- Update the published review only if the user asks; otherwise summarise what changed in the chat.

## 7. Write the commit message

Finish with a commit message in the chat, in a code block, matching the repository's style (`git log --format=%s -10`):

```
<type>(ipaas): <what changed, imperative, under ~72 characters>

- <the main change and why>
- <further changes, one per bullet>
```

`type` is one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. Describe the final state of the change, including the fixes just applied. Add any trailer lines the session's instructions require.

## Boundaries

- Never commit, push, stash or reset. The developer commits.
- Never stage with `git add -A` or `git add .`.
- Do not reformat or refactor files outside the change, even when they would benefit; mention them as a follow-up instead.
- Do not run the e2e suite against a deployed environment as part of the review; it needs credentials and takes an hour.
