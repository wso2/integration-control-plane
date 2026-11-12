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

import { Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, Switch, Tooltip, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import { useSetContextEngineAccess } from '../../../hooks/useContextEngine';
import type { ContextEngineAccess } from '../../../types/contextEngine';

interface AccessSwitchProps {
  engineId: string;
  access: ContextEngineAccess;
  surface: keyof ContextEngineAccess;
  /** Why the switch can't be used right now; it is disabled when set. */
  disabledReason?: string;
}

const SURFACES: Record<keyof ContextEngineAccess, { name: string; clients: string }> = {
  api: { name: 'API', clients: 'Callers' },
  mcp: { name: 'MCP', clients: 'Connected agents' },
};

/** Lets callers through to one public surface, or turns them away with a 403, at the engine's gateway. Turning it off asks first; roles that can't manage configuration see On or Off. */
export default function AccessSwitch({ engineId, access, surface, disabledReason }: AccessSwitchProps): JSX.Element {
  const canManage = useCan()(Scopes.CONFIG_MANAGE);
  const set = useSetContextEngineAccess(engineId);
  const [confirming, setConfirming] = useState(false);
  const { name, clients } = SURFACES[surface];
  const checked = set.isPending ? (set.variables[surface] ?? access[surface]) : access[surface];
  const apply = (on: boolean) => set.mutate({ [surface]: on });
  const onChange = (on: boolean) => (on ? apply(true) : setConfirming(true));

  if (!canManage) return <Chip size="small" variant="outlined" color={access[surface] ? 'success' : 'default'} label={access[surface] ? 'On' : 'Off'} />;

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
        <Tooltip title={disabledReason ?? ''}>
          <span>
            <Switch checked={checked} disabled={set.isPending || !!disabledReason} onChange={(_e, on) => onChange(on)} slotProps={{ input: { 'aria-label': `${name} access` } }} />
          </span>
        </Tooltip>
      </Stack>
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
