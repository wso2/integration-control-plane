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

import { Button, MenuItem, Stack, TextField } from '@wso2/oxygen-ui';
import { Unlink } from '@wso2/oxygen-ui-icons-react';
import type { IntegrationLinks, LinkConnection } from '../../types/configuration';
import { targetName } from '../../utils/integrationLinks';

interface ConnectionLinkProps {
  connection: LinkConnection;
  links: IntegrationLinks;
  busy: boolean;
  onLink: (resource: string | null) => void;
}

/** A connection's link in its box's title bar: the resources that suit it, and Unlink. */
export function ConnectionLink({ connection: c, links, busy, onLink }: ConnectionLinkProps) {
  const name = (id: string) => links.resources.find((r) => r.id === id)?.displayName ?? id;
  // Linking supplies the connection's keys to its fields without links of their own; one another target uses is
  // refused. Only a linked connection's fields carry keys, so an unlinked one's pick relies on that refusal's message.
  // A key only an orphaned link holds (`usedByOrphaned`) is free: the write moves it.
  const clashes = (resource: string) => !!c.link && c.fields.some((f) => !links.fieldLinks[f.configurable] && (links.used[`${resource}|${f.key}`] ?? f.configurable) !== f.configurable);
  const options = c.link && !c.suggestions.includes(c.link) ? [c.link, ...c.suggestions] : c.suggestions;

  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <TextField
        select
        size="small"
        value={c.link ?? ''}
        disabled={busy}
        onChange={(e) => onLink(e.target.value)}
        SelectProps={{ displayEmpty: true, renderValue: (v) => (v ? `Linked to ${name(v as string)}` : `Link… (${c.suggestions.length} match)`) }}
        inputProps={{ 'aria-label': `Link ${targetName(c.id)}` }}
        sx={{ minWidth: 200 }}>
        {options.map((r) => (
          <MenuItem key={r} value={r} disabled={r !== c.link && clashes(r)}>
            {name(r)}
            {r !== c.link && clashes(r) && ' (key in use)'}
          </MenuItem>
        ))}
      </TextField>
      {c.link && (
        <Button size="small" variant="outlined" color="error" startIcon={<Unlink size={14} />} disabled={busy} onClick={() => onLink(null)} aria-label={`Unlink ${targetName(c.id)}`}>
          Unlink
        </Button>
      )}
    </Stack>
  );
}
