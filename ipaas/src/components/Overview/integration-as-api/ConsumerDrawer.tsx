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
import { useEffect, useState, type JSX } from 'react';
import { CONSUMER_NAME_TAKEN, DEFAULT_API_KEY_HEADER, REGENERATE_KEY_WARNING, REVOKE_KEY_WARNING, TOKEN_MASK, TOKEN_NOT_RETRIEVABLE_NOTICE, TOKEN_ONE_TIME_WARNING } from '../../../constants/apiConsumption';
import { useCreateConsumer, useRegenerateConsumerToken, useRevokeConsumer } from '../../../hooks/useConsumers';
import type { Consumer, EndpointRef } from '../../../types/consumers';
import { isConsumerNameTaken } from '../../../utils/apiConsumption';
import { friendlyApiError } from '../../../utils/apiSecurity';
import { isPermissionError } from '../../../utils/apiErrors';
import ConfirmDeleteDialog from '../../ConfirmDeleteDialog';
import CopyButton from './CopyButton';
import * as styles from './apiConsumption.styles';
import { useLeaveGuard, useUnsavedChanges } from '../../../contexts/UnsavedChangesContext';

type ConfirmAction = 'regenerate' | 'revoke';

interface ConsumerDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Project handle the consumer application belongs to. */
  projectName: string;
  /** The endpoint whose exposed API the consumer subscribes to. */
  endpointRef: EndpointRef;
  /** Display label shown in the header badge. */
  envLabel: string;
  /** Existing consumer to manage; `null` opens the create form. */
  consumer: Consumer | null;
  /**
   * Names already taken on this endpoint. Uniqueness is per endpoint, so the
   * same name on a sibling endpoint is fine and must not be rejected here.
   */
  existingNames: readonly string[];
}

/** Right drawer for creating a consumer application for this API, or managing an existing one. */
export default function ConsumerDrawer({ open, onClose, projectName, endpointRef, envLabel, consumer, existingNames }: ConsumerDrawerProps): JSX.Element {
  const createMutation = useCreateConsumer(projectName);
  const regenMutation = useRegenerateConsumerToken(projectName, endpointRef);
  const revokeMutation = useRevokeConsumer(projectName, endpointRef);

  const [appName, setAppName] = useState('');
  const [revealToken, setRevealToken] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `consumer` is the snapshot the row was opened with; a regenerate must replace
  // it, else the next action targets credential ids it already revoked.
  const [regenerated, setRegenerated] = useState<Consumer | null>(null);
  const consumerInView = regenerated ?? consumer ?? createMutation.data ?? null;
  const credential = consumerInView?.credential ?? null;

  // Only create/regenerate return the plaintext; a consumer opened from the list has none.
  const token = credential?.token ?? '';
  const tokenIsFresh = !!token && (createMutation.isSuccess || regenMutation.isSuccess);

  const nameTaken = isConsumerNameTaken(appName, existingNames);

  useEffect(() => {
    if (!open) return;
    setAppName(consumer?.displayName ?? '');
    setRegenerated(null);
    setRevealToken(false);
    setConfirm(null);
    setError(null);
    createMutation.reset();
    regenMutation.reset();
    revokeMutation.reset();
    // Mutation objects are new each render, so they cannot be dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, consumer]);

  const handleGenerate = async () => {
    if (!appName.trim() || nameTaken) return;
    setError(null);
    try {
      await createMutation.mutateAsync({ ...endpointRef, projectName, appName: appName.trim() });
    } catch (err) {
      if (!isPermissionError(err)) setError(friendlyApiError(err, 'Could not create the consumer application.'));
    }
  };

  const handleConfirm = async () => {
    if (!consumerInView) return;
    setError(null);
    try {
      if (confirm === 'regenerate') {
        const next = await regenMutation.mutateAsync(consumerInView);
        setRegenerated({ ...consumerInView, credential: next, status: 'active', credentialIds: [next.id] });
        setRevealToken(false);
      } else {
        await revokeMutation.mutateAsync(consumerInView);
        onClose();
      }
      setConfirm(null);
    } catch (err) {
      if (!isPermissionError(err)) setError(friendlyApiError(err, confirm === 'regenerate' ? 'Could not regenerate the API key.' : 'Could not revoke this API key.'));
    }
  };

  const busy = createMutation.isPending || regenMutation.isPending || revokeMutation.isPending;
  const hasCredentials = !!consumerInView;
  const isRevoked = consumerInView?.status === 'revoked';

  useUnsavedChanges(open && !hasCredentials && appName.trim() !== '');
  const guardNavigation = useLeaveGuard();

  const handleClose = () => {
    if (!busy) guardNavigation(onClose);
  };

  return (
    <DrawerPanel open={open} onClose={handleClose}>
      <DrawerPanel.Header>
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ flex: 1, minWidth: 0 }}>
          <DrawerPanel.Title sx={{ flex: '0 1 auto' }}>{hasCredentials ? consumerInView.displayName : 'New consumer application'}</DrawerPanel.Title>
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
          label="Consumer application name"
          value={hasCredentials ? consumerInView.displayName : appName}
          onChange={(e) => setAppName(e.target.value)}
          placeholder="e.g. my-greeting-client"
          size="small"
          fullWidth
          autoFocus={!hasCredentials}
          required={!hasCredentials}
          disabled={hasCredentials || busy}
          error={!hasCredentials && nameTaken}
          helperText={!hasCredentials && nameTaken ? CONSUMER_NAME_TAKEN : undefined}
          sx={hasCredentials ? styles.lockedField : undefined}
        />

        {hasCredentials && (
          <Box sx={styles.credentialsSection}>
            {tokenIsFresh && (
              <Alert severity="warning" sx={styles.dialogAlert}>
                {TOKEN_ONE_TIME_WARNING}
              </Alert>
            )}

            <Typography sx={styles.fieldLabel}>Header</Typography>
            <Box sx={styles.credField}>
              <Typography component="span" sx={styles.credValue}>
                {DEFAULT_API_KEY_HEADER}
              </Typography>
              <CopyButton value={DEFAULT_API_KEY_HEADER} label="Copy header name" />
            </Box>

            <Typography sx={styles.nextFieldLabel}>API key</Typography>
            {token ? (
              <Box sx={styles.credField}>
                <Typography component="span" sx={styles.credValue}>
                  {revealToken ? token : TOKEN_MASK}
                </Typography>
                <Tooltip title={revealToken ? 'Hide' : 'Reveal'}>
                  <IconButton aria-label={revealToken ? 'Hide API key' : 'Reveal API key'} size="small" onClick={() => setRevealToken((v) => !v)} sx={styles.credIconButton}>
                    {revealToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </IconButton>
                </Tooltip>
                <CopyButton value={token} label="Copy API key" />
              </Box>
            ) : (
              <Alert severity="info">{TOKEN_NOT_RETRIEVABLE_NOTICE}</Alert>
            )}
          </Box>
        )}
      </DrawerPanel.Body>

      <DrawerPanel.Footer sx={hasCredentials ? { justifyContent: 'space-between' } : undefined}>
        {hasCredentials ? (
          <>
            {/* Disabled once revoked — regenerating is the only way back. */}
            <Button variant="outlined" color="error" onClick={() => setConfirm('revoke')} disabled={busy || isRevoked}>
              Revoke
            </Button>
            <Stack direction="row" gap={1}>
              <Button variant="outlined" onClick={() => setConfirm('regenerate')} disabled={busy}>
                Regenerate
              </Button>
              <Button variant="contained" onClick={onClose} disabled={busy}>
                Done
              </Button>
            </Stack>
          </>
        ) : (
          <>
            <Button variant="outlined" color="inherit" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void handleGenerate()} disabled={!appName.trim() || nameTaken || busy} startIcon={createMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}>
              Generate credentials
            </Button>
          </>
        )}
      </DrawerPanel.Footer>

      {confirm && (
        <ConfirmDeleteDialog
          title={confirm === 'regenerate' ? 'Regenerate API key?' : 'Revoke this API key?'}
          onConfirm={() => void handleConfirm()}
          onClose={() => setConfirm(null)}
          isPending={busy}
          confirmLabel={confirm === 'regenerate' ? 'Regenerate' : 'Revoke'}
          pendingLabel={confirm === 'regenerate' ? 'Regenerating…' : 'Revoking…'}
          maxWidth="xs">
          <Typography variant="body2" color="text.secondary">
            {confirm === 'regenerate' ? REGENERATE_KEY_WARNING : REVOKE_KEY_WARNING}
          </Typography>
        </ConfirmDeleteDialog>
      )}
    </DrawerPanel>
  );
}
