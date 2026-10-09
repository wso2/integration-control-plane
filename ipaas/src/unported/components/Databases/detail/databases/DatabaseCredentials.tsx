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

import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { KeyRound, Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useDeleteDbCredential } from '../../../../hooks/usePlatformServices';
import { useEnvTemplates } from '../../../../../hooks/useDeploymentPipelines';
import { envLabel } from '../../../../utils/platformServices';
import CredentialDialog from './CredentialDialog';
import type { DbCredential } from '../../../../../types/platformServices';
import type { Notify } from './types';

interface DatabaseCredentialsProps {
  serverId: string;
  orgHandle: string;
  dbName: string;
  credentials: DbCredential[];
  defaultUser: string;
  isPoweredOn: boolean;
  isDbDeleted: boolean;
  isAddedToMarketplace: boolean;
  notify: Notify;
}

export default function DatabaseCredentials({ serverId, orgHandle, dbName, credentials, defaultUser, isPoweredOn, isDbDeleted, isAddedToMarketplace, notify }: DatabaseCredentialsProps): JSX.Element {
  const { data: environments = [] } = useEnvTemplates(orgHandle);
  const del = useDeleteDbCredential(serverId);
  // dialogCredId: undefined = closed, null = create, string = edit that credential.
  const [dialogCredId, setDialogCredId] = useState<string | null | undefined>(undefined);
  const [toDelete, setToDelete] = useState<DbCredential | null>(null);

  const importDisabled = !isPoweredOn || isDbDeleted;
  const importTooltip = importDisabled ? 'The database server must be running to import credentials.' : 'Ensure the credential is created on the database server before importing it.';

  const confirmDelete = () => {
    if (!toDelete) return;
    del.mutate(toDelete.id, {
      onSuccess: () => {
        notify('success', `Credential '${toDelete.display_name}' removed.`);
        setToDelete(null);
      },
      onError: (e) => {
        notify('error', e instanceof Error ? e.message : 'Failed to remove the credential.');
        setToDelete(null);
      },
    });
  };

  const dialog = dialogCredId !== undefined && (
    <CredentialDialog serverId={serverId} orgHandle={orgHandle} dbName={dbName} defaultUser={defaultUser} existingCredentials={credentials} editingCredentialId={dialogCredId} onClose={() => setDialogCredId(undefined)} notify={notify} />
  );

  if (credentials.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 5, px: 2 }}>
        <KeyRound size={32} style={{ opacity: 0.4 }} />
        <Typography variant="body1" sx={{ fontWeight: 600, mt: 1 }}>
          No database credentials have been imported.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Ensure the required database credentials are created on the database server with the necessary privileges before importing.
        </Typography>
        <Tooltip title={importDisabled ? importTooltip : ''}>
          <span>
            <Button variant="contained" startIcon={<Plus size={16} />} disabled={importDisabled} onClick={() => setDialogCredId(null)}>
              Import Credentials
            </Button>
          </span>
        </Tooltip>
        {dialog}
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Credentials
        </Typography>
        <Tooltip title={importTooltip}>
          <span>
            <Button size="small" variant="outlined" startIcon={<Plus size={16} />} disabled={importDisabled} onClick={() => setDialogCredId(null)}>
              Import Credentials
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        <ListingTable size="small">
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Credential Name</ListingTable.Cell>
              <ListingTable.Cell>Privilege Levels</ListingTable.Cell>
              <ListingTable.Cell>Applicable Environments</ListingTable.Cell>
              <ListingTable.Cell align="right">Actions</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {credentials.map((cred) => {
              const isOnlyMarketplaceCred = credentials.length === 1 && isAddedToMarketplace;
              const deleteDisabled = !isPoweredOn || isOnlyMarketplaceCred;
              return (
                <ListingTable.Row key={cred.id}>
                  <ListingTable.Cell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {cred.display_name}
                    </Typography>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Stack direction="row" gap={0.5} flexWrap="wrap">
                      {cred.is_super_admin ? <Chip label="Super Admin" size="small" color="primary" /> : cred.privilege_levels.map((p) => <Chip key={p} label={p} size="small" variant="outlined" />)}
                    </Stack>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Stack direction="row" gap={0.5} flexWrap="wrap">
                      {cred.applicable_environments.map((id) => (
                        <Chip key={id} label={envLabel(environments, id)} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Stack direction="row" gap={0.5} justifyContent="flex-end">
                      <Tooltip title="Edit">
                        <span>
                          <IconButton size="small" aria-label={`Edit ${cred.display_name}`} disabled={!isPoweredOn || isDbDeleted} onClick={() => setDialogCredId(cred.id)}>
                            <Pencil size={16} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={isOnlyMarketplaceCred ? 'Cannot delete the only credential of a Marketplace-listed database.' : 'Delete'}>
                        <span>
                          <IconButton size="small" color="error" aria-label={`Delete ${cred.display_name}`} disabled={deleteDisabled} onClick={() => setToDelete(cred)}>
                            <Trash2 size={16} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </ListingTable.Cell>
                </ListingTable.Row>
              );
            })}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>

      {dialog}

      {toDelete && (
        <Dialog open onClose={() => setToDelete(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Remove &lsquo;{toDelete.display_name}&rsquo;?</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              You will no longer be able to create connections using &lsquo;{toDelete.display_name}&rsquo;. This won&apos;t remove it from your database or affect existing connections that use it.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setToDelete(null)}>No</Button>
            <Button variant="contained" color="error" onClick={confirmDelete} disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Yes
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
