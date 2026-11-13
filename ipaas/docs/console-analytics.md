# Console analytics

The console reports what people do in it that no API call shows, such as a page view, a create flow left unfinished or an error they saw. ipaas-service reports feature usage that an API call does show (creating, building, deploying, promoting) on its own, so the console never repeats it. Both go to Moesif and join on the user and organization IDs. Tracking issue: integration-engineering#4182.

This is separate from the Moesif browser SDK in `services/tracking/` (`MOESIF_APP_API_KEY`), which sends choreo-console's event names from the browser.

## How it works

- `services/telemetry/consoleActions.ts` buffers actions and posts them every 5 seconds, or at 50 actions, to `POST /telemetry/console-actions` on ipaas-service. It also sends when the tab is hidden or closed, with `keepalive`.
- ipaas-service checks each action against its taxonomy (`growth/console_actions.yaml`), drops anything it does not declare, stamps the user and organization from the token and forwards the rest to Moesif as actions. See its `docs/growth-analytics.md`.
- Off unless `CONSOLE_ANALYTICS_ENABLED` is `true` in `config.json`. Set it together with ipaas-service's `CONSOLE_ANALYTICS_ENABLED`; an older ipaas-service without the route would answer every batch with 404.
- A failed send drops the batch. Nothing is retried, and nothing is shown to the user.

## What is sent

Only IDs, codes and counts. Each action carries:

- `page`: the route template, such as `/organizations/:orgHandler/projects/:projectHandler/home` (`utils/consoleRoute.ts`). Never the path, which holds the organization handle and the names customers chose. It is resolved from the location when the action is recorded. ipaas-service keeps only the segments its `route_segments` list in `growth/console_actions.yaml` names, so a route that adds a new literal segment or parameter name is reported with `:redacted` in its place until that list has it.
- `sessionId`: a random per-tab ID.
- `occurredAt` and the action's dimensions. A dimension never holds what the user typed.

## Phase 1 actions

| Action                          | Reported from                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `navigation.page-view`          | `usePageViewTracking`, in `App`                                                                              |
| `session.start`                 | `useSessionAnalytics`, in `AppLayout`                                                                        |
| `onboarding.first-session`      | `useSessionAnalytics`: the user's first session in this browser                                              |
| `intent.create-option-selected` | `CreateIntegrationPanels`: Cloud Editor, an import, a sample or a prebuilt integration chosen                |
| `intent.form-abandoned`         | `useFormAbandonment`: Create Project, Import Project, Import Integration, MCP proxy, and the prebuilt flow   |
| `onboarding.git-authorization`  | `CreateIntegrationPanels` and `useGitHubAuth`: GitHub authorization started, completed, failed or cancelled  |
| `friction.error-shown`          | `useMutationErrorTracking`: a failed mutation whose `meta.operation` is set (create, build, deploy, promote) |
| `friction.permission-denied`    | `useMutationErrorTracking` (a scope refusal, named by its `meta.operation` or else the route pattern ipaas-service returns) and `CreateIntegrationPanels` (no permission to create)         |
| `friction.empty-state`          | `EmptyListing` with a `report` prop, and a project's empty state                                             |
| `friction.quota-blocked`        | `CreateIntegrationPanels`: the free plan limit blocks creating an integration                                |

Names are `integration-platform.console.<group>.<action>`; `ConsoleAction` lists them and `ConsoleActionDimensions` types each one's dimensions.

## Adding an action

1. Declare it, with its dimensions, in ipaas-service's `growth/console_actions.yaml`. Until a service with it is deployed, the action is dropped.
2. Add it to `ConsoleAction` and `ConsoleActionDimensions`, using the same enum values.
3. Report it with `trackConsoleAction`, or `useConsoleActionWhen` for something shown. For a failed mutation, set `meta.operation` on it.
4. Add it to the table above.
