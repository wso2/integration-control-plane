/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Box, CircularProgress, Divider, IconButton, ListSubheader, MenuItem, Tooltip } from '@wso2/oxygen-ui';
import { Plug, Plus, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';
import MenuSearchField from '../MenuSearchField';

export interface SelectRefreshAction {
  label: string;
  onClick: () => void;
  loading?: boolean;
}

/**
 * The refresh control itself. The mouse-down guard stops the select from treating the click as
 * a choice; callers place it either alone in a header row or beside a menu search field.
 */
export function selectRefreshButton(refresh: SelectRefreshAction): JSX.Element {
  return (
    <Tooltip title={refresh.label} placement="left">
      <span>
        <IconButton
          size="small"
          aria-label={refresh.label}
          disabled={refresh.loading}
          sx={{ color: 'primary.main', flexShrink: 0 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            refresh.onClick();
          }}>
          {refresh.loading ? <CircularProgress size={14} /> : <RefreshCw size={14} />}
        </IconButton>
      </span>
    </Tooltip>
  );
}

/** The refresh control alone in a menu row — used when the list is short enough to have no search. */
export function selectRefreshHeader(refresh: SelectRefreshAction): JSX.Element {
  return (
    <ListSubheader key="gh-refresh" sx={{ display: 'flex', justifyContent: 'flex-end', bgcolor: 'background.paper', lineHeight: 1, py: 0.5, minHeight: 0 }}>
      {selectRefreshButton(refresh)}
    </ListSubheader>
  );
}

export interface SelectMenuSearch {
  key: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Whether the list is long enough to warrant a search field. */
  show: boolean;
}

/**
 * The menu's header row: the search field with the refresh beside it, or — when the list is too
 * short for a search — the refresh on its own row. Returns null when there is neither.
 */
export function selectMenuHeader(search: SelectMenuSearch, refresh?: SelectRefreshAction): JSX.Element | null {
  if (search.show) {
    return <MenuSearchField key={search.key} value={search.value} onChange={search.onChange} placeholder={search.placeholder} action={refresh ? selectRefreshButton(refresh) : undefined} />;
  }
  return refresh ? selectRefreshHeader(refresh) : null;
}

/**
 * Footer actions appended inside the GitHub Organization / Repository dropdown
 * menus (Devant parity). Each is a `<MenuItem>` carrying a sentinel value; the
 * select's onChange intercepts these values and runs the matching action
 * (opening a GitHub popup) instead of selecting a repo/org. They are never a
 * valid selection, so the select's `value` always maps to a real option.
 */
export const GH_SELECT_ACTION = {
  addOrg: '__gh_add_org__',
  connectRepos: '__gh_connect_repos__',
  createRepo: '__gh_create_repo__',
} as const;

const ACTION_SX = { color: 'primary.main', gap: 1 } as const;

function actionItem(value: string, label: string, icon: ReactNode): JSX.Element {
  return (
    <MenuItem key={value} value={value} sx={ACTION_SX}>
      <Box component="span" sx={{ display: 'flex' }}>
        {icon}
      </Box>
      {label}
    </MenuItem>
  );
}

/** Leading items for the Organization select (rendered above the org options). `showInstall` gates the App-install action (needs a configured slug). */
export function organizationActionItems(showInstall: boolean, refresh?: SelectRefreshAction): JSX.Element[] {
  const items: JSX.Element[] = [];
  if (refresh) items.push(selectRefreshHeader(refresh));
  if (showInstall) items.push(actionItem(GH_SELECT_ACTION.addOrg, 'Add organization', <Plus size={16} />));
  if (items.length === 0) return [];
  items.push(<Divider key="gh-org-divider" />);
  return items;
}

/** Leading items for the Repository select (rendered above the repo options). Connect needs a configured slug; Create is always available. */
export function repositoryActionItems(showInstall: boolean, refresh?: SelectRefreshAction): JSX.Element[] {
  const items: JSX.Element[] = [];
  if (refresh) items.push(selectRefreshHeader(refresh));
  if (showInstall) items.push(actionItem(GH_SELECT_ACTION.connectRepos, 'Connect more repositories', <Plug size={16} />));
  items.push(actionItem(GH_SELECT_ACTION.createRepo, 'Create repository', <Plus size={16} />));
  items.push(<Divider key="gh-repo-divider" />);
  return items;
}
