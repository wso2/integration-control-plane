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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Ban, KeyRound, Plus } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { REVOKE_KEY_WARNING } from '../../../constants/apiConsumption';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import { useEndpointApiKeys, useRevokeEndpointApiKey } from '../../../hooks/useConsumers';
import type { ApiKeySummary, EndpointRef } from '../../../types/consumers';
import { apiKeyLabel, apiKeySubtitle, normalizeKeyStatus } from '../../../utils/apiConsumption';
import { friendlyApiError } from '../../../utils/apiSecurity';
import { isPermissionError } from '../../../utils/apiErrors';
import ConfirmDeleteDialog from '../../ConfirmDeleteDialog';
import ApiKeyDrawer from './ApiKeyDrawer';
import * as styles from './apiConsumption.styles';

interface ApiKeysPanelProps {
  /** The environment's API for the selected endpoint. */
  endpointRef: EndpointRef;
  /** Display label of the environment. */
  envLabel: string;
  /**
   * The API takes OAuth tokens and refuses API keys. Keys are then listed only so the live ones, which work
   * again if the API goes back to API key, can be revoked: no new ones.
   */
  oauth: boolean;
}

/** Cloud-only "API keys" subcard inside the API env card: the keys issued for this environment's API. */
export default function ApiKeysPanel({ endpointRef, envLabel, oauth }: ApiKeysPanelProps): JSX.Element | null {
  const can = useCan();
  const canManageKeys = can(Scopes.ENDPOINT_API_KEY_MANAGE);

  const { data: keys = [], isLoading, error, refetch } = useEndpointApiKeys(endpointRef);
  const revokeMutation = useRevokeEndpointApiKey(endpointRef);

  const [drawerOpen, setDrawerOpen] = useState(false);
  // Each open mounts a fresh drawer, so it never shows the key issued the last time it was open.
  const [drawerSession, setDrawerSession] = useState(0);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeySummary | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);

  // Revoked keys are kept by the platform for good, so they wait behind a toggle rather than outgrow the live ones.
  const live = useMemo(() => keys.filter((k) => normalizeKeyStatus(k.status) === 'active'), [keys]);
  const revoked = useMemo(() => keys.filter((k) => normalizeKeyStatus(k.status) === 'revoked'), [keys]);
  const listed = showRevoked ? [...live, ...revoked] : live;

  const openDrawer = () => {
    setDrawerSession((s) => s + 1);
    setDrawerOpen(true);
  };

  const handleRevoke = async () => {
    if (!pendingRevoke) return;
    setRevokeError(null);
    try {
      await revokeMutation.mutateAsync(pendingRevoke.name);
      setPendingRevoke(null);
    } catch (err) {
      if (!isPermissionError(err)) setRevokeError(friendlyApiError(err, `Could not revoke “${apiKeyLabel(pendingRevoke)}”.`));
    }
  };

  // Under OAuth with no live key, there is nothing to revoke and none to issue.
  if (oauth && !isLoading && !error && live.length === 0) return null;

  return (
    <Box sx={styles.subCard}>
      <Box sx={styles.subCardHeader}>
        <Typography variant="body2" sx={styles.subCardTitle}>
          <KeyRound size={16} />
          API keys
          <Typography component="span" variant="caption" color="text.secondary">
            ({live.length})
          </Typography>
        </Typography>
        {canManageKeys && !oauth && (
          <Button variant="contained" size="small" startIcon={<Plus size={14} />} onClick={openDrawer}>
            Generate API key
          </Button>
        )}
      </Box>

      {oauth && (
        <Alert severity="info" sx={styles.panelAlert}>
          This API takes OAuth tokens, so it refuses these API keys. They work again if the API goes back to API key, so revoke any key you no longer trust.
        </Alert>
      )}

      {isLoading ? (
        <Box sx={styles.loadingRow}>
          <CircularProgress size={20} />
        </Box>
      ) : error ? (
        <Alert
          severity="warning"
          sx={styles.panelAlert}
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }>
          {friendlyApiError(error, 'Could not load the API keys.')}
        </Alert>
      ) : (
        <>
          {listed.length > 0 ? (
            <Stack gap={1} role="list" aria-label="API keys" sx={styles.keyList}>
              {listed.map((key) => {
                const label = apiKeyLabel(key);
                const isRevoked = normalizeKeyStatus(key.status) === 'revoked';
                return (
                  <Box key={key.name} role="listitem" sx={styles.keyRow}>
                    <Box sx={styles.keyIcon}>
                      <KeyRound size={16} />
                    </Box>
                    <Box sx={styles.keyRowText}>
                      <Stack direction="row" alignItems="center" gap={0.75} sx={styles.keyNameRow}>
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {label}
                        </Typography>
                        <Chip label={isRevoked ? 'Revoked' : 'Active'} size="small" color={isRevoked ? 'error' : 'success'} variant="outlined" sx={styles.statusChip} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" noWrap sx={styles.keyRowSubtitle}>
                        {apiKeySubtitle(key)}
                      </Typography>
                    </Box>
                    {canManageKeys && !isRevoked && (
                      <Tooltip title="Revoke API key">
                        <IconButton size="small" aria-label={`Revoke ${label}`} onClick={() => setPendingRevoke(key)} sx={styles.revokeButton}>
                          <Ban size={15} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Box sx={styles.emptyState}>
              <Typography variant="caption" color="text.secondary">
                {revoked.length > 0 ? 'No active API keys. Generate one to start calling this API.' : 'No API keys yet. Generate one to start calling this API.'}
              </Typography>
            </Box>
          )}
          {revoked.length > 0 && (
            <Button size="small" color="inherit" onClick={() => setShowRevoked((v) => !v)} aria-expanded={showRevoked} sx={styles.revokedToggle}>
              {showRevoked ? 'Hide revoked keys' : `Show revoked keys (${revoked.length})`}
            </Button>
          )}
        </>
      )}

      <ApiKeyDrawer key={drawerSession} open={drawerOpen} onClose={() => setDrawerOpen(false)} endpointRef={endpointRef} envLabel={envLabel} liveNames={live.map(apiKeyLabel)} revokedNames={revoked.map(apiKeyLabel)} />

      {pendingRevoke && (
        <ConfirmDeleteDialog
          title={`Revoke “${apiKeyLabel(pendingRevoke)}”?`}
          onConfirm={() => void handleRevoke()}
          onClose={() => {
            setPendingRevoke(null);
            setRevokeError(null);
          }}
          isPending={revokeMutation.isPending}
          confirmLabel="Revoke"
          pendingLabel="Revoking…"
          maxWidth="xs">
          {revokeError && (
            <Alert severity="error" sx={styles.dialogAlert}>
              {revokeError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            {REVOKE_KEY_WARNING}
          </Typography>
        </ConfirmDeleteDialog>
      )}
    </Box>
  );
}
