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

import { InputAdornment, ListSubheader, TextField } from '@wso2/oxygen-ui';
import { Search } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

/** Lists shorter than this are quicker to scan than to search. */
export const MENU_SEARCH_THRESHOLD = 5;

interface MenuSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Rendered to the right of the field, on the same row (e.g. a refresh control). */
  action?: JSX.Element;
}

/**
 * Filter row for a `TextField select` menu — render it as the menu's first child, where
 * `ListSubheader` keeps it pinned and non-selectable.
 */
export default function MenuSearchField({ value, onChange, placeholder = 'Search', action }: MenuSearchFieldProps): JSX.Element {
  return (
    <ListSubheader sx={{ p: 1, bgcolor: 'background.paper', display: 'flex', alignItems: 'center', gap: 1 }}>
      <TextField
        size="small"
        fullWidth
        autoFocus
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Only text entry stops here — Select's type-ahead would steal it and Space would close the
        // menu. Arrows, Enter, Tab and Escape must reach the MenuList to keep it keyboard-navigable.
        onKeyDown={(e) => {
          if (e.key.length === 1) e.stopPropagation();
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
          },
        }}
      />
      {action}
    </ListSubheader>
  );
}
