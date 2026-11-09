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
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import type { LinkTarget, OrphanedLink } from '../../types/configuration';
import { targetName, type FormLinkView } from '../../utils/integrationLinks';

const boxSx = { mb: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 } as const;

/** Links whose target the build lacks: each to move to another target, or remove. */
export function OrphanedLinks({ view, connections, configurables, busy, change }: { view: FormLinkView; connections: string[]; configurables: string[]; busy: boolean; change: (t: LinkTarget) => Promise<unknown> }) {
  return (
    <Box sx={boxSx}>
      {view.orphaned.map((o) => (
        <Orphan key={o.target} orphan={o} name={o.name} targets={o.kind === 'connection' ? connections : configurables} busy={busy} change={change} />
      ))}
    </Box>
  );
}

function Orphan({ orphan: o, name, targets, busy, change }: { orphan: OrphanedLink; name: string; targets: string[]; busy: boolean; change: (t: LinkTarget) => Promise<unknown> }) {
  const [to, setTo] = useState('');
  const removal: LinkTarget = o.kind === 'connection' ? { connection: o.target } : { configurable: o.target };
  // Taking the key from the lost target moves the link: the orphan goes in the same write.
  const move = () => change(o.kind === 'connection' ? { connection: to, ref: o.ref } : { configurable: to, ref: o.ref, key: o.key });
  // An endpoint link holds no resource key, so there is nothing for another
  // target to take over: only removing it clears it.
  const movable = o.kind !== 'endpoint';
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ py: 0.5 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2">
          <code>{targetName(o.target)}</code> is no longer in the code
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {o.key ? `from ${name} · ${o.key}` : `Linked to ${name}`}
        </Typography>
      </Box>
      {movable && (
        <>
          <TextField select size="small" value={to} onChange={(e) => setTo(e.target.value)} sx={{ minWidth: 160 }} SelectProps={{ displayEmpty: true }} inputProps={{ 'aria-label': `Move ${targetName(o.target)} to` }}>
            <MenuItem value="" disabled>
              Move to…
            </MenuItem>
            {targets.map((t) => (
              <MenuItem key={t} value={t}>
                {targetName(t)}
              </MenuItem>
            ))}
          </TextField>
          <Button size="small" variant="outlined" disabled={busy || !to} onClick={move}>
            Move
          </Button>
        </>
      )}
      <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => change(removal)}>
        Remove
      </Button>
    </Stack>
  );
}
