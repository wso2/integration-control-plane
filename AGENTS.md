# AGENTS.md

This repository holds the WSO2 Integration Platform console in [`ipaas/`](ipaas/). All application code, tests and tooling live there.

- Run every command from `ipaas/`, not from the repository root.
- Follow [`ipaas/AGENTS.md`](ipaas/AGENTS.md). It covers commands, structure, code rules and the definition of done.
- Folders with their own rules carry their own `AGENTS.md`: `ipaas/src/api/`, `ipaas/src/auth/`, `ipaas/src/unported/` and `ipaas/tests/e2e/`. Read the one for the folder you are changing.
- CI lives in `.github/workflows/`. The PR check runs the unit tests in `ipaas/`.
