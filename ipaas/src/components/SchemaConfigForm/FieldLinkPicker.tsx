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

import { useState } from 'react';
import { IconButton, ListSubheader, MenuItem, MenuList, Popover, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Link2 } from '@wso2/oxygen-ui-icons-react';
import type { FieldLinkPicker as Picker } from './linkedFrom';

/** The link icon at the end of a field's box: where the field gets its value, as one choice of a list. */
export function FieldLinkPicker({ field, picker }: { field: string; picker: Picker }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pick = (choice: { resource: string; key: string } | { endpoint: string } | null) => {
    setAnchor(null);
    picker.onPick(choice);
  };

  return (
    <>
      <Tooltip title="Link">
        <span>
          <IconButton size="small" aria-label={`Link ${field}`} color={anchor ? 'primary' : 'default'} disabled={picker.disabled} onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.25 }}>
            <Link2 size={14} />
          </IconButton>
        </span>
      </Tooltip>
      <Popover open={!!anchor && !picker.disabled} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuList dense aria-label={`Source of ${field}`} sx={{ minWidth: 280, maxHeight: 320, overflow: 'auto' }}>
          <MenuItem selected={picker.selected === picker.first} onClick={() => pick(null)}>
            {picker.first}
          </MenuItem>
          {!!picker.endpoints?.length && <ListSubheader sx={{ lineHeight: 2 }}>Integrations in this project</ListSubheader>}
          {picker.endpoints?.map((e) => (
            <MenuItem key={e.id} selected={picker.selected === e.id} disabled={!!e.unavailable} onClick={() => pick({ endpoint: e.id })}>
              {e.name}
              {e.unavailable && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {e.unavailable}
                </Typography>
              )}
            </MenuItem>
          ))}
          {!!picker.connections?.length && <ListSubheader sx={{ lineHeight: 2 }}>Integrations in other projects</ListSubheader>}
          {picker.connections?.flatMap((c) => [
            <ListSubheader key={c.id} sx={{ lineHeight: 2, pl: 3 }}>
              {c.name}
              {c.unavailable && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {c.unavailable}
                </Typography>
              )}
            </ListSubheader>,
            ...c.outputs.map((o) => (
              <MenuItem key={`${c.id}|${o.name}`} selected={picker.selected === `${c.id}|${o.name}`} disabled={!!c.unavailable} onClick={() => pick({ endpoint: c.id, key: o.name })} sx={{ pl: 4 }}>
                {o.name}
              </MenuItem>
            )),
          ])}
          {picker.resources.flatMap((r) => [
            <ListSubheader key={r.id} sx={{ lineHeight: 2 }}>
              {r.name}
            </ListSubheader>,
            ...r.keys.map((k) => (
              <MenuItem key={`${r.id}|${k.key}`} selected={picker.selected === `${r.id}|${k.key}`} disabled={!!k.usedBy} onClick={() => pick({ resource: r.id, key: k.key })}>
                {k.key}
                {(k.usedBy || k.orphanOf) && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {k.usedBy ? `used by ${k.usedBy}` : `from ${k.orphanOf}, no longer in the code`}
                  </Typography>
                )}
              </MenuItem>
            )),
          ])}
        </MenuList>
      </Popover>
    </>
  );
}
