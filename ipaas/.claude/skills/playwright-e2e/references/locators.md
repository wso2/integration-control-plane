# Locating oxygen-ui components

`@wso2/oxygen-ui` is built on MUI, so components land on standard ARIA roles. Knowing the mapping saves a run per selector. Treat the table as the expected mapping rather than gospel — if a locator misses, open the trace and read the actual DOM instead of guessing a second time.

## Role mapping

| UI element          | Role and locator                                               | Notes                                                                                         |
| ------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Button              | `getByRole('button', { name: 'Create Project', exact: true })` | Use `exact` when the name prefixes another button's name.                                     |
| Icon-only button    | `getByRole('button', { name: 'Clear project' })`               | Needs an `aria-label` in the component; if absent, add one (see SKILL.md).                    |
| Link                | `getByRole('link', { name: 'Terms of Use' })`                  | External links are `target="_blank"` — assert `href`/`target` rather than clicking.           |
| TextField           | `getByLabel('Display Name')`                                   | `getByRole('textbox')` works when there is exactly one on screen.                             |
| TextField, no label | `getByPlaceholder('Search projects')`                          |                                                                                               |
| Select              | `getByRole('combobox', { name: 'Select organization' })`       | The accessible name comes from the label. Click it, then pick from the listbox.               |
| Select options      | `getByRole('option', { name: 'US' })`                          | Rendered in a portal, not inside the select.                                                  |
| Autocomplete        | `getByRole('combobox')`                                        | Same shape as Select.                                                                         |
| Menu item           | `getByRole('menuitem', { name: 'Sign Out' })`                  | The container is `role="menu"`.                                                               |
| Tab                 | `getByRole('tab', { name: 'Samples' })`                        | Panel is `role="tabpanel"`.                                                                   |
| Dialog              | `getByRole('dialog')`                                          | Scope inner queries to it when the same button name exists behind the dialog.                 |
| Alert / Snackbar    | `getByRole('alert')`                                           | See the filtering note below.                                                                 |
| Checkbox, Switch    | `getByRole('checkbox')`                                        | MUI Switch renders a checkbox input.                                                          |
| Radio               | `getByRole('radio', { name: '...' })`                          |                                                                                               |
| Table               | `getByRole('table')`, rows `getByRole('row')`                  | A MUI DataGrid is `role="grid"` with `gridcell`, not `table` — check which one the page uses. |
| Heading             | `getByRole('heading', { name: 'All Projects' })`               | Add `{ level: 1 }` only if you actually care about the level.                                 |
| Progress / spinner  | `getByRole('progressbar')`                                     | Handy for waiting out a loading state.                                                        |

## Gotchas that have already bitten this suite

**Static banners are also `role="alert"`.** A page can render an informational alert _and_ an error alert, so a bare `getByRole('alert')` matches the wrong one. Filter it by text, or scope it to the panel you are testing.

**Two combobox names in the header.** The header has both `Select organization` and `Select project`. Always pass the name.

**Names that are prefixes.** `Sign Out` is both the account-menu item and the confirmation dialog's button; scope the second to `getByRole('dialog')`. `Create` matches "Create an Integration" and "Create Project" unless you pass `{ exact: true }`.

**Backend-supplied names.** Derive them at runtime rather than hardcoding. Project cards carry `aria-label="Settings for <name>"` on their gear button, so a test can read a name back:

```ts
const gearButton = page.getByRole('button', { name: /^Settings for /i }).first();
const displayName = ((await gearButton.getAttribute('aria-label')) ?? '').replace(/^Settings for /i, '');
```

For the run's own project, prefer `activeProject()` and `getByRole('button', { name: `Settings for ${activeProject()}`, exact: true })`.

**Portals.** Menus, dialogs, tooltips and select listboxes render at the end of `<body>`, not inside the component that opened them. Query them from `page`, not from a locator scoped to the trigger.

**Skeletons look like content.** Pages show `Skeleton` placeholders while loading, so "some card is visible" can pass before data arrives. Wait for a specific name, not for a generic container.

## Third-party pages

These are not in this repo, so their selectors cannot be derived from source, and they are the most likely to break when the provider updates. Current working set:

- **Thunder's hosted sign-in page** (`/gate/signin`): `getByRole('button', { name: 'Continue with GitHub' })` and `'Continue with Google'`; the page shows only a progress bar until its flow loads (see `specs/cloud-anon/login.spec.ts`).
- **GitHub sign-in** (`cloud.setup.ts`): `#login_field`, `#password`, `getByRole('button', { name: 'Sign in', exact: true })`; the TOTP or emailed-code field is matched by several ids at once because GitHub varies it.
- **Thunder's organization form** on a first-ever sign-in: textboxes named `/organization name/i` and `/organization handle/i`, then `/create organization/i`.

When these break, run `--headed`, inspect the real page, and update the locators in `cloud.setup.ts` or the anon spec — do not paper over it with longer timeouts.
