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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { KeyRound, Pencil, Plus, RefreshCw, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import Authorized from '../../components/Authorized';
import EmptyListing from '../../components/EmptyListing';
import OrgSettingsTabs from '../../components/Settings/OrgSettingsTabs';
import CopyOnPremKeyDialog from '../components/Settings/OnPremKeys/CopyOnPremKeyDialog';
import OnPremKeyFormDialog from '../components/Settings/OnPremKeys/OnPremKeyFormDialog';
import { Permissions } from '../../constants/permissions';
import { useGenerateOnPremKey, useOnPremKeySubscription, useOnPremKeys, useRegenerateOnPremKey, useRenameOnPremKey, useRevokeOnPremKey } from '../hooks/useOnPremKeys';
import type { OnPremKey } from '../../types/onPremKey';
import type { OrgScope } from '../../nav';

const MASKED_KEY = 'xxxxxxxx-xxxx-xxxx-xxxxxxxxxx';
const TRIAL_KEY_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function OnPremKeys({ org }: OrgScope): JSX.Element {
  const { data: keys, isLoading, isError, error, refetch } = useOnPremKeys(org);
  const { data: subscription } = useOnPremKeySubscription(org);
  // A 403 means the access token isn't scoped for the on-prem-key service (an
  // org entitlement / token-scope matter, not a transient failure).
  const forbidden = error instanceof Error && error.message.includes('HTTP 403');
  const generate = useGenerateOnPremKey(org);
  const regenerate = useRegenerateOnPremKey(org);
  const rename = useRenameOnPremKey(org);
  const revoke = useRevokeOnPremKey(org);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [renaming, setRenaming] = useState<OnPremKey | null>(null);
  const [regenerating, setRegenerating] = useState<OnPremKey | null>(null);
  const [revoking, setRevoking] = useState<OnPremKey | null>(null);
  const [copyKey, setCopyKey] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Subscription expiry → banner. `daysPastEnd > 0` means the window has lapsed.
  const daysPastEnd = subscription ? (Date.now() - new Date(subscription.endDate).getTime()) / DAY_MS : null;
  const expired = daysPastEnd != null && daysPastEnd > 0;
  const expiringInDays = daysPastEnd != null && !expired && daysPastEnd >= -90 ? Math.ceil(-daysPastEnd) : null;

  const trialLimitReached = subscription?.plan === 'TRIAL' && (keys?.length ?? 0) >= TRIAL_KEY_LIMIT;
  const generateDisabledReason = expired ? 'On-premises keys have expired. Contact WSO2 to renew.' : trialLimitReached ? `The trial plan allows up to ${TRIAL_KEY_LIMIT} keys.` : '';

  const handleGenerate = (displayName: string) =>
    generate.mutate(displayName, {
      onSuccess: (created) => {
        setGenerateOpen(false);
        if (created.key) setCopyKey(created.key);
      },
    });

  const handleRename = (displayName: string) => {
    if (!renaming) return;
    rename.mutate(
      { handle: renaming.handle, displayName },
      {
        onSuccess: () => {
          setRenaming(null);
          setAlert({ type: 'success', message: 'Key renamed.' });
        },
      },
    );
  };

  const handleRegenerate = () => {
    if (!regenerating) return;
    regenerate.mutate(regenerating.handle, {
      onSuccess: (updated) => {
        setRegenerating(null);
        if (updated.key) setCopyKey(updated.key);
      },
      onError: (e) => {
        setRegenerating(null);
        setAlert({ type: 'error', message: e.message || 'Failed to regenerate the key.' });
      },
    });
  };

  const handleRevoke = () => {
    if (!revoking) return;
    const name = revoking.displayName;
    revoke.mutate(revoking.handle, {
      onSuccess: () => {
        setRevoking(null);
        setAlert({ type: 'success', message: `Key '${name}' revoked.` });
      },
      onError: (e) => {
        setRevoking(null);
        setAlert({ type: 'error', message: e.message || 'Failed to revoke the key.' });
      },
    });
  };

  return (
    <PageContent>
      <OrgSettingsTabs active="on-prem-keys" />

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h6">On-Premises Keys</Typography>
        {!!keys?.length && (
          <Authorized permissions={Permissions.ENVIRONMENT_MANAGE}>
            <Tooltip title={generateDisabledReason}>
              <span>
                <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setGenerateOpen(true)} disabled={!!generateDisabledReason} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                  Generate Key
                </Button>
              </span>
            </Tooltip>
          </Authorized>
        )}
      </Stack>

      {expired && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Your on-premises keys have expired. Contact WSO2 to renew your subscription.
        </Alert>
      )}
      {expiringInDays != null && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Your on-premises keys will expire in {expiringInDays} day{expiringInDays === 1 ? '' : 's'}. Contact WSO2 to extend your subscription.
        </Alert>
      )}
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        forbidden ? (
          <Alert severity="info">On-premises keys aren&apos;t available for this organization. Your access token isn&apos;t scoped for the on-premises key service — contact WSO2 if you need this enabled.</Alert>
        ) : (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }>
            Failed to load on-premises keys.
          </Alert>
        )
      ) : !keys?.length ? (
        <Authorized permissions={Permissions.ENVIRONMENT_MANAGE} fallback={<EmptyListing icon={<KeyRound size={48} />} title="No on-premises keys" description="On-premises keys let you connect an on-prem WSO2 API Manager to the platform." />}>
          <EmptyListing icon={<KeyRound size={48} />} title="No on-premises keys" description="Create a key to connect an on-prem WSO2 API Manager to the platform." showAction actionLabel="Generate Key" onAction={() => setGenerateOpen(true)} />
        </Authorized>
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Key</ListingTable.Cell>
                <ListingTable.Cell align="right">Action</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {keys.map((k) => (
                <ListingTable.Row key={k.handle}>
                  <ListingTable.Cell>{k.displayName}</ListingTable.Cell>
                  <ListingTable.Cell>
                    <Tooltip title="Regenerate to copy a new on-premises key">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                        {MASKED_KEY}
                      </Typography>
                    </Tooltip>
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Authorized permissions={Permissions.ENVIRONMENT_MANAGE}>
                      <Tooltip title="Regenerate">
                        <IconButton size="small" aria-label={`Regenerate ${k.displayName}`} onClick={() => setRegenerating(k)}>
                          <RefreshCw size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Rename">
                        <IconButton size="small" aria-label={`Rename ${k.displayName}`} onClick={() => setRenaming(k)}>
                          <Pencil size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Revoke">
                        <IconButton size="small" color="error" aria-label={`Revoke ${k.displayName}`} onClick={() => setRevoking(k)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </Authorized>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {generateOpen && <OnPremKeyFormDialog title="Generate On-Premises Key" submitLabel="Generate" busyLabel="Generating…" busy={generate.isPending} error={generate.error?.message} onSubmit={handleGenerate} onClose={() => setGenerateOpen(false)} />}
      {renaming && <OnPremKeyFormDialog title="Rename Key" submitLabel="Save" busyLabel="Saving…" initialName={renaming.displayName} busy={rename.isPending} error={rename.error?.message} onSubmit={handleRename} onClose={() => setRenaming(null)} />}
      {copyKey && <CopyOnPremKeyDialog keyValue={copyKey} onClose={() => setCopyKey(null)} />}

      {regenerating && (
        <Dialog open onClose={() => setRegenerating(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Regenerate &lsquo;{regenerating.displayName}&rsquo;?</DialogTitle>
          <DialogContent>
            <DialogContentText>This invalidates the current key and issues a new one. Anything using the old key must be updated.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRegenerating(null)} disabled={regenerate.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleRegenerate} disabled={regenerate.isPending} startIcon={regenerate.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {regenerate.isPending ? 'Regenerating…' : 'Regenerate'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {revoking && (
        <Dialog open onClose={() => setRevoking(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Revoke &lsquo;{revoking.displayName}&rsquo;?</DialogTitle>
          <DialogContent>
            <DialogContentText>This permanently revokes the key. Anything using it will lose access. This cannot be undone.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRevoking(null)} disabled={revoke.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleRevoke} disabled={revoke.isPending} startIcon={revoke.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {revoke.isPending ? 'Revoking…' : 'Revoke'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </PageContent>
  );
}
