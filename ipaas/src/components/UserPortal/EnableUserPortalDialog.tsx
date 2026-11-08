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

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Stack, TextField } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import type { SomeEnvironments } from '../../utils/userPortal';

interface EnableUserPortalDialogProps {
  /** The environments without a User Portal, in promotion order. */
  environments: SomeEnvironments;
  isPending: boolean;
  /** The enable's failure, shown as ipaas-service worded it. */
  error: string | null;
  onEnable: (environment: string) => void;
  onClose: () => void;
}

// Most portals belong in production, so the first critical environment is picked; with none, the first in promotion order.
const defaultEnvironment = (environments: SomeEnvironments): string => (environments.find((e) => e.critical) ?? environments[0]).id;

/** Picks the environment to enable the User Portal in. */
export default function EnableUserPortalDialog({ environments, isPending, error, onEnable, onClose }: EnableUserPortalDialogProps): JSX.Element {
  const [environment, setEnvironment] = useState(() => defaultEnvironment(environments));

  return (
    <Dialog open onClose={isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Enable User Portal</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>Users sign in to the environment&apos;s identity provider, and find the AI agents, automations and workflows you publish to it there.</DialogContentText>
          <TextField select labelPlacement="top" label="Environment" value={environment} onChange={(e) => setEnvironment(e.target.value)} disabled={isPending} fullWidth size="small">
            {environments.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {e.name}
              </MenuItem>
            ))}
          </TextField>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => onEnable(environment)} disabled={isPending} startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {isPending ? 'Enabling…' : 'Enable'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
