---
name: create-automation
description: Write unit and integration tests for a reproduced bug based on issue-analysis.md.
user-invocable: true
argument-hint: "[path to issue-analysis.md]"
---

# /create-automation — Test Creation for Reproduced Bugs

You are an AI assistant that writes unit and integration tests for a confirmed bug. Follow the procedure below precisely.

## Step 0: Load Context

1. Locate and read `issue-analysis.md`. If an explicit path is provided as the argument, use it. Otherwise, search for `.ai/issue-analysis.md` at the repository root. If the file doesn't exist, **stop immediately** and tell the developer to run `/reproduce` first.
2. Read the repository's `agents.md` from the root. If it doesn't exist, **stop immediately** and tell the developer to create one (point them to `agents.md.template`).
3. From `agents.md`, load the **Testing** section to understand framework, naming conventions, test locations, and run commands.

## Step 1: Understand the Bug

From `issue-analysis.md`, extract:
- The specific bug scenario and root cause hypothesis.
- Affected component(s) and feature(s).
- The execution path that triggers the bug.
- The proposed test plan (if present).

## Step 2: Identify the Affected Component

1. Using `agents.md > Architecture > Module/Component Map`, identify the exact module where the bug exists.
2. Locate the existing test directory for that module.
3. Study existing tests in that directory to understand:
   - Test framework and assertion style.
   - File and method naming patterns.
   - Base classes, fixtures, or shared utilities used.
   - Directory structure conventions.

## Step 3: Write Unit Tests

Create unit tests for the affected component that cover:
1. **The specific bug scenario** — a test that fails before the fix and passes after.
2. **Edge cases** around the affected execution path.
3. **Negative test cases** — invalid inputs, boundary conditions, error paths.

Follow the existing test conventions exactly (framework, naming, style, location).

## Step 4: Write Integration Tests (If Applicable)

If the bug involves cross-component interaction, external APIs, or end-to-end flows, create integration tests that:
1. **Reproduce the bug scenario** end-to-end.
2. **Verify the fix** resolves the issue when applied.
3. **Cover regression paths** for related functionality.

Skip this step if the bug is purely within a single unit and integration tests would add no value. Document why if skipped.

## Step 5: Verify Tests

1. Run the newly created tests using the commands from `agents.md > Testing > Running Tests`.
2. Confirm that:
   - Tests that target the bug scenario **fail** against the current (unfixed) code (if the bug is still present).
   - Tests that target edge cases and negative paths **pass**.
3. If tests fail unexpectedly, investigate and fix the test code. Do not proceed with broken tests.

## Step 6: Write Summary

After all tests are created and verified, output a summary to the developer containing:
- **Tests created:** file paths and a one-line description of what each test covers.
- **Component and module targeted.**
- **Assumptions or limitations** encountered during test creation.

## Important Rules

- **Follow existing conventions.** Match the test framework, naming patterns, directory structure, and style already used in the component's test suite. Do not introduce new patterns.
- **Minimal scope.** Only write tests related to the bug described in `issue-analysis.md`. Do not refactor or add unrelated tests.
- **Artifacts over memory.** Test files must be self-contained and understandable without additional context.
- **Never guess.** If the test approach is ambiguous or you're unsure about conventions, stop and ask the developer.
- After writing tests, display the following message to the user:

> ✅ Tests have been created for the affected component.
>
> **Tests created:**
> _(list the test files and a one-line description of each)_
>
> **Next steps:**
> 1. Run `/review` to review the generated test code for quality and correctness.
> 2. Run `/security-review` to check for any security implications in the changes.
