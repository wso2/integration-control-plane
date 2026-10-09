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

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Plus, RotateCcw, Trash2, Download } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useCreateKafkaUser, useDeleteKafkaUser, useKafkaUsers, useResetKafkaUserCredentials } from '../../hooks/usePlatformServices';

const downloadText = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'application/x-pem-file' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function UsersTab({ brokerId }: { brokerId: string }): JSX.Element {
  const { data: users = [], isLoading, isError, refetch } = useKafkaUsers(brokerId);
  const create = useCreateKafkaUser(brokerId);
  const del = useDeleteKafkaUser(brokerId);
  const reset = useResetKafkaUserCredentials(brokerId);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [userToReset, setUserToReset] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const usernames = users.map((u) => u.username);

  const handleAddClick = () => {
    setNewUsername('');
    setAddError(null);
    setAddDialogOpen(true);
  };

  const handleAddConfirm = () => {
    if (!newUsername.trim()) {
      setAddError('Username is required');
      return;
    }
    if (usernames.includes(newUsername)) {
      setAddError('A user with this username already exists.');
      return;
    }
    setAddError(null);
    create.mutate(newUsername, {
      onSuccess: () => {
        setAddDialogOpen(false);
        setNewUsername('');
      },
      onError: (err) => {
        setAddError(err instanceof Error ? err.message : 'Failed to create user');
      },
    });
  };

  const handleDeleteClick = (username: string) => {
    setDeleteError(null);
    setUserToDelete(username);
  };

  const handleConfirmDelete = () => {
    if (!userToDelete) return;
    del.mutate(userToDelete, {
      onSuccess: () => {
        setUserToDelete(null);
      },
      onError: (err) => {
        setDeleteError(err instanceof Error ? err.message : 'Failed to delete user');
      },
    });
  };

  const handleResetClick = (username: string) => {
    setResetError(null);
    setUserToReset(username);
  };

  const handleConfirmReset = () => {
    if (!userToReset) return;
    reset.mutate(userToReset, {
      onSuccess: () => {
        setUserToReset(null);
      },
      onError: (err) => {
        setResetError(err instanceof Error ? err.message : 'Failed to reset credentials');
      },
    });
  };

  if (isLoading) {
    return <CircularProgress sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  }

  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Failed to load users.
      </Alert>
    );
  }

  return (
    <>
      <Stack gap={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Users
          </Typography>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={handleAddClick}>
            Add User
          </Button>
        </Stack>

        {users.length === 0 ? (
          <Alert severity="info">No users yet. Add a user to issue Kafka credentials.</Alert>
        ) : (
          <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <ListingTable size="small">
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Username</ListingTable.Cell>
                  <ListingTable.Cell>Certificate Validity</ListingTable.Cell>
                  <ListingTable.Cell>Certificate</ListingTable.Cell>
                  <ListingTable.Cell align="right">Actions</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {users.map((user) => (
                  <ListingTable.Row key={user.username}>
                    <ListingTable.Cell>{user.username}</ListingTable.Cell>
                    <ListingTable.Cell>{user.access_cert_expiry ? new Date(user.access_cert_expiry).toLocaleString() : '—'}</ListingTable.Cell>
                    <ListingTable.Cell>
                      <Stack direction="row" gap={1}>
                        <Button size="small" variant="text" startIcon={<Download size={14} />} onClick={() => downloadText('service.key', user.access_key ?? '')}>
                          Access Key
                        </Button>
                        <Button size="small" variant="text" startIcon={<Download size={14} />} onClick={() => downloadText('service.cert', user.access_cert ?? '')}>
                          Access Cert
                        </Button>
                      </Stack>
                    </ListingTable.Cell>
                    <ListingTable.Cell align="right">
                      <Stack direction="row" gap={0.5}>
                        <IconButton size="small" aria-label={`Reset credentials for ${user.username}`} onClick={() => handleResetClick(user.username)}>
                          <RotateCcw size={16} />
                        </IconButton>
                        {user.username === 'avnadmin' ? (
                          <Tooltip title="The default admin user cannot be deleted.">
                            <span>
                              <IconButton size="small" color="inherit" aria-label={`Delete ${user.username}`} disabled>
                                <Trash2 size={16} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : (
                          <IconButton size="small" color="inherit" aria-label={`Delete ${user.username}`} onClick={() => handleDeleteClick(user.username)}>
                            <Trash2 size={16} />
                          </IconButton>
                        )}
                      </Stack>
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ))}
              </ListingTable.Body>
            </ListingTable>
          </ListingTable.Container>
        )}
      </Stack>

      {addDialogOpen && (
        <Dialog open onClose={create.isPending ? undefined : () => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add User</DialogTitle>
          <DialogContent>
            <Stack gap={2} sx={{ mt: 1 }}>
              {addError && <Alert severity="error">{addError}</Alert>}
              <TextField
                label="Username"
                fullWidth
                size="small"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
                error={usernames.includes(newUsername) && newUsername.trim() !== ''}
                helperText={usernames.includes(newUsername) && newUsername.trim() !== '' ? 'A user with this username already exists.' : ''}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddDialogOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleAddConfirm} disabled={!newUsername.trim() || usernames.includes(newUsername) || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {create.isPending ? 'Adding…' : 'Add'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {userToDelete && (
        <Dialog open onClose={del.isPending ? undefined : () => setUserToDelete(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Delete user</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              This will permanently delete <strong>{userToDelete}</strong> and revoke its access.
            </Typography>
            {deleteError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {deleteError}
              </Alert>
            )}
          </DialogContent>
          <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ p: 2 }}>
            <Button onClick={() => setUserToDelete(null)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleConfirmDelete} disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {del.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </Stack>
        </Dialog>
      )}

      {userToReset && (
        <Dialog open onClose={reset.isPending ? undefined : () => setUserToReset(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Reset credentials</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              This will invalidate the current certificate and key for <strong>{userToReset}</strong> and issue new ones. Consumers using the old credentials will lose access.
            </Typography>
            {resetError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {resetError}
              </Alert>
            )}
          </DialogContent>
          <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ p: 2 }}>
            <Button onClick={() => setUserToReset(null)} disabled={reset.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleConfirmReset} disabled={reset.isPending} startIcon={reset.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {reset.isPending ? 'Resetting…' : 'Confirm'}
            </Button>
          </Stack>
        </Dialog>
      )}
    </>
  );
}
