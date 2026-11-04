# AGENTS.md

This repository holds two products, each in its own folder with its own code, tests and tooling:

- [`ipaas/`](ipaas/): the WSO2 Integration Platform console.
- [`user-portal/`](user-portal/): the User Portal's data plane instance (UP-DP), a Go BFF that serves a React SPA.

In either one:

- Run every command from the product's folder, not from the repository root.
- Follow that folder's `AGENTS.md`: [`ipaas/AGENTS.md`](ipaas/AGENTS.md) or [`user-portal/AGENTS.md`](user-portal/AGENTS.md). Each covers commands, structure and code rules.
- Folders with their own rules carry their own `AGENTS.md`: `ipaas/src/api/`, `ipaas/src/auth/`, `ipaas/src/unported/` and `ipaas/tests/e2e/`. Read the one for the folder you are changing.
- CI lives in `.github/workflows/`. The PR check runs the unit tests in `ipaas/`. The `UP-DP PR Check` workflow runs the Go tests and lint for the whole `user-portal/` module and builds the SPA. The `UP-DP Release` workflow releases the UP-DP image.
