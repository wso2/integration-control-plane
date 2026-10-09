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

import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, Stack, Switch, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Pencil, Plus, ShieldCheck, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import Authorized from '../../../../components/Authorized';
import EmptyListing from '../../../../components/EmptyListing';
import { Permissions } from '../../../../constants/permissions';
import { useDeleteIdentityProvider, useIdentityProviders, useToggleIdentityProvider } from '../../../hooks/useAppSecurity';
import type { IdentityProvider } from '../../../../types/appSecurity';
import RegisterIdpDialog from './RegisterIdpDialog';
import AddIdpCards from './AddIdpCards';
import IdpDetailModal from './IdpDetailModal';

// Built-in / internal key managers are not user-managed external IdPs.
const HIDDEN_TYPES = new Set(['default', 'ChoreoAppDevSTS']);
const INTERNAL_KM_PREFIX = '_internal_key_manager_';
const ASGARDEO_DISPLAY_PREFIX = 'WSO2 Identity Platform -';

export default function IdentityProvidersTab({ orgHandler }: { orgHandler: string }): JSX.Element {
  const { data: idps, isLoading, isError, refetch } = useIdentityProviders();
  const toggle = useToggleIdentityProvider();
  const remove = useDeleteIdentityProvider();

  // The org's built-in Asgardeo key manager is surfaced with a friendly name and
  // is read-only (matching Devant).
  const internalKmName = `${INTERNAL_KM_PREFIX}${orgHandler}`;
  const displayName = (idp: IdentityProvider) => (idp.name === internalKmName ? `${ASGARDEO_DISPLAY_PREFIX} ${orgHandler}` : idp.name);
  const isInternalKm = (idp: IdentityProvider) => idp.name === internalKmName;

  const [editing, setEditing] = useState<IdentityProvider | null>(null);
  const [adding, setAdding] = useState(false);
  const [wizardType, setWizardType] = useState<string | null>(null);
  const [viewing, setViewing] = useState<IdentityProvider | null>(null);
  const [deleting, setDeleting] = useState<IdentityProvider | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const builtIn = useMemo(() => (idps ?? []).find((i) => i.type === 'default'), [idps]);
  const external = useMemo(() => (idps ?? []).filter((i) => !HIDDEN_TYPES.has(i.type)), [idps]);

  const handleToggle = (idp: IdentityProvider, enabled: boolean) => toggle.mutate({ id: idp.id, enabled }, { onError: (e) => setAlert({ type: 'error', message: e.message || 'Failed to update the identity provider.' }) });

  const handleDelete = () => {
    if (!deleting) return;
    const name = deleting.name;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        setAlert({ type: 'success', message: `Identity provider '${name}' deleted.` });
      },
      onError: (e) => {
        setDeleting(null);
        setAlert({ type: 'error', message: e.message || 'Failed to delete the identity provider.' });
      },
    });
  };

  if (isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  if (isError)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Failed to load identity providers.
      </Alert>
    );

  return (
    <>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {adding ? (
        // Keep the cards view mounted behind the wizard modal so opening it doesn't
        // revert to the table; we only leave on Back or a successful save.
        <AddIdpCards onSelect={(type) => setWizardType(type)} onBack={() => setAdding(false)} />
      ) : (
        <>
          {builtIn && (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 3 }}>
              <Stack direction="row" alignItems="center" gap={1}>
                <Typography sx={{ fontWeight: 600 }}>WSO2 Integration Platform Built-in Identity Provider</Typography>
                <Chip label="Built-in" size="small" variant="outlined" />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                The built-in identity provider managed by WSO2 Integration Platform
              </Typography>
            </Box>
          )}

          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              External Identity Providers
            </Typography>
            <Authorized permissions={Permissions.USER_MANAGE_ROLES}>
              <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setAdding(true)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                Add Identity Provider
              </Button>
            </Authorized>
          </Stack>

          {external.length === 0 ? (
            <EmptyListing icon={<ShieldCheck size={48} />} title="No external identity providers" description="Add an identity provider to let consumers authenticate with an external IdP." />
          ) : (
            <ListingTable.Container>
              <ListingTable>
                <ListingTable.Head>
                  <ListingTable.Row>
                    <ListingTable.Cell>Name</ListingTable.Cell>
                    <ListingTable.Cell>Description</ListingTable.Cell>
                    <ListingTable.Cell>Type</ListingTable.Cell>
                    <ListingTable.Cell>Status</ListingTable.Cell>
                    <ListingTable.Cell align="right">Action</ListingTable.Cell>
                  </ListingTable.Row>
                </ListingTable.Head>
                <ListingTable.Body>
                  {external.map((idp) => {
                    const readOnly = isInternalKm(idp);
                    return (
                      <ListingTable.Row
                        key={idp.id}
                        clickable
                        hover
                        tabIndex={0}
                        aria-label={`View ${displayName(idp)}`}
                        onClick={() => setViewing(idp)}
                        onKeyDown={(e) => {
                          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            setViewing(idp);
                          }
                        }}>
                        <ListingTable.Cell>{displayName(idp)}</ListingTable.Cell>
                        <ListingTable.Cell>{idp.description || '—'}</ListingTable.Cell>
                        <ListingTable.Cell>{idp.type}</ListingTable.Cell>
                        <ListingTable.Cell>
                          <Authorized permissions={Permissions.USER_MANAGE_ROLES} fallback={<Chip label={idp.enabled ? 'Enabled' : 'Disabled'} size="small" color={idp.enabled ? 'success' : 'default'} variant="outlined" />}>
                            <Switch checked={idp.enabled} onClick={(e) => e.stopPropagation()} onChange={(e) => handleToggle(idp, e.target.checked)} disabled={toggle.isPending || readOnly} inputProps={{ 'aria-label': `Toggle ${displayName(idp)}` }} />
                          </Authorized>
                        </ListingTable.Cell>
                        <ListingTable.Cell align="right">
                          {!readOnly && (
                            <Authorized permissions={Permissions.USER_MANAGE_ROLES}>
                              <Tooltip title="Edit">
                                <IconButton
                                  size="small"
                                  aria-label={`Edit ${displayName(idp)}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditing(idp);
                                  }}>
                                  <Pencil size={16} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  color="error"
                                  aria-label={`Delete ${displayName(idp)}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleting(idp);
                                  }}>
                                  <Trash2 size={16} />
                                </IconButton>
                              </Tooltip>
                            </Authorized>
                          )}
                        </ListingTable.Cell>
                      </ListingTable.Row>
                    );
                  })}
                </ListingTable.Body>
              </ListingTable>
            </ListingTable.Container>
          )}
        </>
      )}

      {(wizardType || editing) && (
        <RegisterIdpDialog
          type={editing?.type ?? wizardType ?? 'Custom'}
          existing={editing ?? undefined}
          onClose={() => {
            setWizardType(null);
            setEditing(null);
          }}
          onSaved={(name) => {
            setAdding(false);
            setAlert({ type: 'success', message: `Identity provider '${name}' saved.` });
          }}
          onError={(message) => setAlert({ type: 'error', message })}
        />
      )}

      {viewing && <IdpDetailModal idp={viewing} displayName={displayName(viewing)} onClose={() => setViewing(null)} />}

      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete &lsquo;{deleting.name}&rsquo;?</DialogTitle>
          <DialogContent>
            <DialogContentText>This permanently removes the identity provider. This action cannot be undone.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleDelete} disabled={remove.isPending} startIcon={remove.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
