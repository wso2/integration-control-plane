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

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListingTable, MenuItem, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useCreateKafkaAcl, useDeleteKafkaAcl, useKafkaAcls, useKafkaTopics, useKafkaUsers } from '../../hooks/usePlatformServices';

const PERMISSION_LABELS: Record<string, string> = {
  read: 'Consume',
  write: 'Produce',
  readwrite: 'Produce & Consume',
  admin: 'Admin',
};

export default function AclTab({ brokerId }: { brokerId: string }): JSX.Element {
  const { data: aclsData, isLoading, isError, refetch } = useKafkaAcls(brokerId);
  const acls = aclsData?.acls ?? [];
  const { data: users = [] } = useKafkaUsers(brokerId);
  const { data: topics = [] } = useKafkaTopics(brokerId);
  const create = useCreateKafkaAcl(brokerId);
  const del = useDeleteKafkaAcl(brokerId);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedPermission, setSelectedPermission] = useState('read');
  const [addError, setAddError] = useState<string | null>(null);
  const [aclToDelete, setAclToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const usernames = users.map((u) => u.username);
  const topicNames = topics.map((t) => t.topic_name);

  const handleAddClick = () => {
    setSelectedUsername('');
    setSelectedTopic('');
    setSelectedPermission('read');
    setAddError(null);
    setAddDialogOpen(true);
  };

  const handleAddConfirm = () => {
    if (!selectedUsername || !selectedTopic || !selectedPermission) {
      setAddError('All fields are required');
      return;
    }
    setAddError(null);
    create.mutate(
      { username: selectedUsername, topic: selectedTopic, permission: selectedPermission },
      {
        onSuccess: () => {
          setAddDialogOpen(false);
          setSelectedUsername('');
          setSelectedTopic('');
          setSelectedPermission('read');
        },
        onError: (err) => {
          setAddError(err instanceof Error ? err.message : 'Failed to create ACL entry');
        },
      },
    );
  };

  const handleDeleteClick = (aclId: string) => {
    setDeleteError(null);
    setAclToDelete(aclId);
  };

  const handleConfirmDelete = () => {
    if (!aclToDelete) return;
    del.mutate(aclToDelete, {
      onSuccess: () => {
        setAclToDelete(null);
      },
      onError: (err) => {
        setDeleteError(err instanceof Error ? err.message : 'Failed to delete ACL entry');
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
        Failed to load access control entries.
      </Alert>
    );
  }

  return (
    <>
      <Stack gap={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Access Control
          </Typography>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={handleAddClick}>
            Add Entry
          </Button>
        </Stack>

        {acls.length === 0 ? (
          <Alert severity="info">No access control entries. Add an entry to grant a user access to a topic.</Alert>
        ) : (
          <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <ListingTable size="small">
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Username</ListingTable.Cell>
                  <ListingTable.Cell>Topic</ListingTable.Cell>
                  <ListingTable.Cell>Permission</ListingTable.Cell>
                  <ListingTable.Cell align="right">Actions</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {acls.map((acl) => (
                  <ListingTable.Row key={acl.id}>
                    <ListingTable.Cell>{acl.username}</ListingTable.Cell>
                    <ListingTable.Cell>{acl.topic}</ListingTable.Cell>
                    <ListingTable.Cell>{PERMISSION_LABELS[acl.permission] || acl.permission}</ListingTable.Cell>
                    <ListingTable.Cell align="right">
                      {acl.username === 'avnadmin' ? (
                        <Tooltip title="Default ACL entries cannot be deleted.">
                          <span>
                            <IconButton size="small" color="inherit" aria-label={`Delete ACL for ${acl.username}`} disabled>
                              <Trash2 size={16} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      ) : (
                        <IconButton size="small" color="inherit" aria-label={`Delete ACL for ${acl.username}`} onClick={() => handleDeleteClick(acl.id)}>
                          <Trash2 size={16} />
                        </IconButton>
                      )}
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
          <DialogTitle>Add Access Control Entry</DialogTitle>
          <DialogContent>
            <Stack gap={2} sx={{ mt: 1 }}>
              {addError && <Alert severity="error">{addError}</Alert>}
              <TextField select label="Username" size="small" fullWidth required value={selectedUsername} onChange={(e) => setSelectedUsername(e.target.value)}>
                <MenuItem value="">Select username</MenuItem>
                {usernames.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Topic" size="small" fullWidth required value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}>
                <MenuItem value="">Select topic</MenuItem>
                <MenuItem value="*">* (All Topics)</MenuItem>
                {topicNames.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Permission" size="small" fullWidth required value={selectedPermission} onChange={(e) => setSelectedPermission(e.target.value)}>
                <MenuItem value="read">Consume</MenuItem>
                <MenuItem value="write">Produce</MenuItem>
                <MenuItem value="readwrite">Produce & Consume</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddDialogOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleAddConfirm} disabled={!selectedUsername || !selectedTopic || !selectedPermission || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {create.isPending ? 'Adding…' : 'Add'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {aclToDelete && (
        <Dialog open onClose={del.isPending ? undefined : () => setAclToDelete(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Delete access control entry</DialogTitle>
          <DialogContent>
            {deleteError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {deleteError}
              </Alert>
            )}
          </DialogContent>
          <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ p: 2 }}>
            <Button onClick={() => setAclToDelete(null)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleConfirmDelete} disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {del.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </Stack>
        </Dialog>
      )}
    </>
  );
}
