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

**Static banners are also `role="alert"`.** A page can render an informational alert _and_ an error alert, so a bare `getByRole('alert')` matches the wrong one. Filter it:

```ts
const errorAlert = page.getByRole('alert').filter({ hasNotText: 'You can start with the default Cloud Data Plane' });
```

**Two combobox names on the same nav.** The top bar has both `Select organization` and `Select project`. Always pass the name.

**Names that are prefixes.** On org home, `Create` and `Import` are distinct buttons but `Create` also matches "Create an Integration" and "Create Project" elsewhere. `{ exact: true }` is what keeps these honest.

**Backend-supplied names.** Derive them at runtime rather than hardcoding. The pattern used in `org-overview.spec.ts`:

```ts
const gearButton = page.getByRole('button', { name: /^Settings for /i }).first();
await gearButton.waitFor({ state: 'visible' });
const displayName = ((await gearButton.getAttribute('aria-label')) ?? '').replace(/^Settings for /i, '');
await page.getByText(displayName, { exact: true }).first().click();
```

**Portals.** Menus, dialogs, tooltips and select listboxes render at the end of `<body>`, not inside the component that opened them. Query them from `page`, not from a locator scoped to the trigger.

**Headings that repeat.** `global.setup.ts` learned this the hard way: the region step's own heading is an `h1`, so waiting on "some h1" resolved immediately and skipped the actual wait. Wait for the specific name, or assert the URL.

## Third-party pages

The WSO2 Identity Platform (Asgardeo) login screens are not in this repo, so their selectors cannot be derived from source. They are also the most likely thing to break when the IdP updates. Current working set, from `global.setup.ts`:

- `getByPlaceholder('Enter your email')` then `getByRole('button', { name: 'Continue' })`
- OTP: a single `getByRole('textbox')` on the `email_otp` page
- Password fallback: `locator('input[type="password"]').first()`, submit via `locator('#loginButton, button[type="submit"], input[type="submit"]').first()`

When these break, run `--headed`, inspect the real page, and update the locators in `global.setup.ts` — do not paper over it with longer timeouts.
