# Integration Platform Console — developer guide

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-5-FF4154?logo=reactquery&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-e2e-2EAD33?logo=playwright&logoColor=white)

The web console for the WSO2 Integration Platform on WSO2 Cloud. This guide covers how to build, test and change it. For a tour of the product and how the frontend is put together, start with the [repository README](../README.md).

> [!NOTE]
> The console is a React single-page application. All of its data comes from `ipaas-service`, the platform's backend-for-frontend, and users sign in through Thunder, the WSO2 Cloud identity provider. [docs/architecture.md](docs/architecture.md) shows how the parts fit together.

---

## Prerequisites

| Tool                      | Version     | Needed for                      |
| ------------------------- | ----------- | ------------------------------- |
| Node.js                   | 20 or later | Building and testing            |
| pnpm                      | 10          | Dependencies and scripts        |
| Docker + local WSO2 Cloud | —           | Trying the console in a browser |

## Getting started

**1. Install the dependencies**

```bash
cd ipaas
pnpm install
```

**2. Build the console**

```bash
pnpm build          # production build in dist/
pnpm build:check    # type-check, then build
```

**3. Try it in the local WSO2 Cloud stack**

The console needs its backend, its identity provider and the rest of the platform around it. To see your changes in a browser, bring up the local WSO2 Cloud stack and deploy the console into it.

> [!IMPORTANT]
> Follow the **[local setup guide](https://docs.google.com/document/d/1El3uqR674ZDjLfbEP3VSQZgGxYjQMK0kfxQakc9Lh_s)** to bring up the stack and deploy your build. Do not test against a shared environment.

> [!TIP]
> `public/config.json` already points at the local stack, so a local build needs no configuration. Other environments supply their own copy when they deploy the console; see [docs/runtime-config.md](docs/runtime-config.md).

## Testing

```bash
pnpm lint           # ESLint
pnpm test:unit      # unit tests (Vitest); also run on every pull request
pnpm test:e2e       # end-to-end tests (Playwright) against a deployed console
```

- **Unit tests** sit next to the code they test, as `*.test.ts` or `*.test.tsx`.
- **End-to-end tests** run in WSO2 Cloud's release validation for every release, and on your machine with credentials. [tests/e2e/README.md](tests/e2e/README.md) explains both.

## Project structure

```text
ipaas/
├── src/
│   ├── api/         Calls to the backend, one file per domain
│   ├── auth/        Sign-in and tokens (Thunder SDK)
│   ├── hooks/       Data hooks over the API (TanStack Query)
│   ├── pages/       One component per route
│   ├── components/  Shared and feature components
│   ├── layouts/     App shell and route guards
│   ├── config/      Routes and runtime configuration
│   ├── unported/    Features waiting for backend support (not routed)
│   └── …            contexts, types, utils, constants, services
├── public/          Static files, including config.json
├── tests/e2e/       End-to-end tests
├── docs/            Architecture and configuration
├── Dockerfile       Console image (nginx)
└── Dockerfile.e2e   End-to-end test image
```

## 📚 Documentation

| Document                                                               | What it covers                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                           | Platform pieces, request flow, code layering                              |
| [docs/runtime-config.md](docs/runtime-config.md)                       | `config.json` keys and how deployments set them                           |
| [tests/e2e/README.md](tests/e2e/README.md)                             | End-to-end suite: setups, local runs, release validation                  |
| [src/components/Overview/README.md](src/components/Overview/README.md) | The integration overview page and its types                               |
| [src/contexts/README.md](src/contexts/README.md)                       | Shared React contexts                                                     |
| [AGENTS.md](AGENTS.md)                                                 | Code rules and conventions: written for coding agents, useful to everyone |

## 🤝 Contributing

Before opening a pull request, make sure these pass:

```bash
pnpm build:check
pnpm lint
pnpm test:unit
```

> [!TIP]
> The code rules — layering, page states and skeletons, styling, naming — are listed in [AGENTS.md](AGENTS.md). Reading them first saves review rounds.

> [!CAUTION]
> Never commit `.env.test`, `.env.local`, `.auth/` or real credentials in `public/config.json`.
