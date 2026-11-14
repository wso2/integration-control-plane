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

import { Alert, Box, Button, Chip, CircularProgress, DrawerPanel, IconButton, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Eye, EyeOff } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { API_KEY_NAME_REVOKED, API_KEY_NAME_TAKEN, DEFAULT_API_KEY_HEADER, TOKEN_MASK, TOKEN_ONE_TIME_WARNING } from '../../../constants/apiConsumption';
import { useCreateEndpointApiKey, useEndpointSecurity } from '../../../hooks/useConsumers';
import type { EndpointRef } from '../../../types/consumers';
import { isKeyNameTaken } from '../../../utils/apiConsumption';
import { friendlyApiError } from '../../../utils/apiSecurity';
import { isPermissionError } from '../../../utils/apiErrors';
import CopyButton from './CopyButton';
import * as styles from './apiConsumption.styles';
import { useLeaveGuard, useUnsavedChanges } from '../../../contexts/UnsavedChangesContext';

interface ApiKeyDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The endpoint whose exposed API the key is issued for. */
  endpointRef: EndpointRef;
  /** Display label shown in the header badge. */
  envLabel: string;
  /**
   * Names of this endpoint's live and revoked keys. A revoked key keeps its name, so neither can be issued
   * again. Uniqueness is per endpoint, so the same name on a sibling endpoint is fine and must not be
   * rejected here.
   */
  liveNames: readonly string[];
  revokedNames: readonly string[];
}

/**
 * Right drawer that issues a named API key for this API and shows it once. Its parent mounts a new one for
 * each open, so it starts empty without resetting itself.
 */
export default function ApiKeyDrawer({ open, onClose, endpointRef, envLabel, liveNames, revokedNames }: ApiKeyDrawerProps): JSX.Element {
  const createMutation = useCreateEndpointApiKey(endpointRef);
  const { data: security } = useEndpointSecurity(endpointRef, open);
  const header = security?.apiKey?.header || DEFAULT_API_KEY_HEADER;

  const [name, setName] = useState('');
  const [revealKey, setRevealKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issued = createMutation.data ?? null;
  const nameHint = isKeyNameTaken(name, liveNames) ? API_KEY_NAME_TAKEN : isKeyNameTaken(name, revokedNames) ? API_KEY_NAME_REVOKED : null;
  const nameTaken = nameHint !== null;

  const handleGenerate = async () => {
    if (!name.trim() || nameTaken) return;
    setError(null);
    try {
      await createMutation.mutateAsync({ displayName: name.trim() });
    } catch (err) {
      if (!isPermissionError(err)) setError(friendlyApiError(err, 'Could not generate the API key.'));
    }
  };

  const busy = createMutation.isPending;

  useUnsavedChanges(open && !issued && name.trim() !== '');
  const guardNavigation = useLeaveGuard();

  const handleClose = () => {
    if (!busy) guardNavigation(onClose);
  };

  // The closing drawer stays on screen as it slides out, so the key is masked before it goes.
  const handleDone = () => {
    setRevealKey(false);
    onClose();
  };

  return (
    <DrawerPanel open={open} onClose={handleClose}>
      <DrawerPanel.Header>
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ flex: 1, minWidth: 0 }}>
          <DrawerPanel.Title sx={{ flex: '0 1 auto' }}>{issued ? name.trim() : 'Generate API key'}</DrawerPanel.Title>
          <Chip label={envLabel} size="small" color="success" variant="outlined" sx={styles.envChip} />
        </Stack>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>
        {error && (
          <Alert severity="error" sx={styles.dialogAlert}>
            {error}
          </Alert>
        )}

        <TextField
          labelPlacement="top"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. billing-service"
          size="small"
          fullWidth
          autoFocus={!issued}
          required={!issued}
          disabled={!!issued || busy}
          error={!issued && nameTaken}
          helperText={!issued && nameHint ? nameHint : 'Name the key after the client that uses it, so you know which key to revoke.'}
          sx={issued ? styles.lockedField : undefined}
        />

        {issued && (
          <Box sx={styles.credentialsSection}>
            <Alert severity="warning" sx={styles.dialogAlert}>
              {TOKEN_ONE_TIME_WARNING}
            </Alert>

            <Typography sx={styles.fieldLabel}>Header</Typography>
            <Box sx={styles.credField}>
              <Typography component="span" sx={styles.credValue}>
                {header}
              </Typography>
              <CopyButton value={header} label="Copy header name" />
            </Box>

            <Typography sx={styles.nextFieldLabel}>API key</Typography>
            <Box sx={styles.credField}>
              <Typography component="span" sx={styles.credValue}>
                {revealKey ? issued.apiKey : TOKEN_MASK}
              </Typography>
              <Tooltip title={revealKey ? 'Hide' : 'Reveal'}>
                <IconButton aria-label={revealKey ? 'Hide API key' : 'Reveal API key'} size="small" onClick={() => setRevealKey((v) => !v)} sx={styles.credIconButton}>
                  {revealKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </IconButton>
              </Tooltip>
              <CopyButton value={issued.apiKey} label="Copy API key" />
            </Box>
          </Box>
        )}
      </DrawerPanel.Body>

      <DrawerPanel.Footer>
        {issued ? (
          <Button variant="contained" onClick={handleDone}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="outlined" color="inherit" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void handleGenerate()} disabled={!name.trim() || nameTaken || busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
              {busy ? 'Generating…' : 'Generate'}
            </Button>
          </>
        )}
      </DrawerPanel.Footer>
    </DrawerPanel>
  );
}
