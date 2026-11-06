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

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Link, Stack, Switch, Tooltip, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useContextPermissions, useSetContextEngineAccess } from '../../../hooks/useContextEngine';
import type { ContextEngineAccess } from '../../../types/contextEngine';

interface AccessSwitchProps {
  engineId: string;
  access: ContextEngineAccess;
  surface: keyof ContextEngineAccess;
  /** Why the switch can't be used, beyond a missing manage permission; it is disabled when set. */
  disabledReason?: string;
}

const SURFACES: Record<keyof ContextEngineAccess, { name: string; clients: string }> = {
  api: { name: 'API', clients: 'Callers' },
  mcp: { name: 'MCP', clients: 'Connected agents' },
};

/** Lets callers through to one public surface, or turns them away with a 403, at the engine's gateway. Turning it off asks first. */
export default function AccessSwitch({ engineId, access, surface, disabledReason }: AccessSwitchProps): JSX.Element {
  const set = useSetContextEngineAccess(engineId);
  const permissions = useContextPermissions(engineId);
  const blocked =
    disabledReason ??
    (permissions.isPending ? 'Checking your permissions…' : permissions.isError ? "Couldn't check your permissions." : permissions.data?.includes('engine.manage') ? undefined : 'You need the manage permission on this engine to change its access.');
  const [confirming, setConfirming] = useState(false);
  const { name, clients } = SURFACES[surface];
  const checked = set.isPending ? (set.variables[surface] ?? access[surface]) : access[surface];
  const apply = (on: boolean) => set.mutate({ [surface]: on });
  const onChange = (on: boolean) => (on ? apply(true) : setConfirming(true));

  return (
    <Stack alignItems="flex-end">
      <Stack direction="row" alignItems="center" gap={1}>
        {set.isPending && (
          <>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">
              Applying…
            </Typography>
          </>
        )}
        <Tooltip title={blocked ?? ''}>
          <span>
            <Switch checked={checked} disabled={set.isPending || !!blocked} onChange={(_e, on) => onChange(on)} slotProps={{ input: { 'aria-label': `${name} access` } }} />
          </span>
        </Tooltip>
      </Stack>
      {!disabledReason && permissions.isError && (
        <Typography variant="caption" color="error">
          Couldn&apos;t check your permissions.{' '}
          <Link component="button" type="button" variant="caption" onClick={() => void permissions.refetch()}>
            Retry
          </Link>
        </Typography>
      )}
      {set.isError && (
        <Typography variant="caption" color="error">
          {set.error.message || "Couldn't change access. Try again."}
        </Typography>
      )}
      {confirming && (
        <Dialog open onClose={() => setConfirming(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Turn off {name} access?</DialogTitle>
          <DialogContent>
            <DialogContentText>{clients} get a 403 until you turn it back on.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => {
                setConfirming(false);
                apply(false);
              }}>
              Turn off
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  );
}
