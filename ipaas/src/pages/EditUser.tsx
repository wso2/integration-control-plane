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

import { Alert, Autocomplete, Avatar, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListingTable, PageContent, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, useCallback, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import SearchField from '../components/SearchField';
import { useAuth } from '#auth';
import { useAccessControl } from '../contexts/AccessControlContext';
import { Permissions } from '../constants/permissions';
import { useUsers, useGroups, useUpdateUserGroups, useRemoveUserFromGroup } from '../hooks/useAuth';
import type { User, Group } from '../types/auth';
import { orgAccessControlUrl } from '../paths';
import { FormDialog } from '../components/Settings/AccessControl/shared';
import { useFiltered, getUserInitial } from '../components/Settings/AccessControl/utils';

function AssignGroupsDialog({ orgHandler, user, onClose, onAssigned }: { orgHandler: string; user: User; onClose: () => void; onAssigned?: () => void }) {
  const { data: allGroups = [] } = useGroups(orgHandler);
  const mutation = useUpdateUserGroups(orgHandler);
  const [selected, setSelected] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const available = allGroups.filter((g) => !user.groups.some((ug) => ug.groupId === g.groupId));
  // The user-side groups body is keyed by group UUID (full replacement set). A
  // missing uuid would silently drop that membership, so fail fast instead.
  const handleAssign = () => {
    const groupIds = [...user.groups, ...selected].map((g) => g.uuid);
    if (groupIds.some((id) => !id)) {
      setError('One or more groups are missing an identifier. Please reload and try again.');
      return;
    }
    mutation.mutate(
      { userId: user.userId, groupIds: groupIds as string[] },
      {
        onSuccess: () => {
          onAssigned?.();
          onClose();
        },
        onError: (errorObj) => setError(errorObj?.message ?? 'Failed to assign groups. Please try again.'),
      },
    );
  };
  return (
    <FormDialog open onClose={onClose} primaryLabel="Assign" primaryDisabled={selected.length === 0 || mutation.isPending} onPrimary={handleAssign} title="Assign Groups">
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Autocomplete
        multiple
        options={available}
        getOptionLabel={(g) => g.groupName}
        value={selected}
        onChange={(_, v) => setSelected(v)}
        isOptionEqualToValue={(a, b) => a.groupId === b.groupId}
        renderInput={(params) => <TextField {...params} label="Groups" placeholder="Select groups" />}
      />
    </FormDialog>
  );
}

function UserDetailView({ orgHandler, user, onBack }: { orgHandler: string; user: User; onBack: () => void }) {
  const { username: currentUsername } = useAuth();
  const { hasOrgPermission } = useAccessControl();
  const canManageUsers = hasOrgPermission(Permissions.USER_MANAGE_USERS);
  const isSelf = user.username === currentUsername;
  const removeUserMutation = useRemoveUserFromGroup(orgHandler);
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [removingGroupId, setRemovingGroupId] = useState<string | null>(null);
  const [viewAlert, setViewAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const getSearchStr = useCallback((g: User['groups'][number]) => `${g.groupName} ${g.groupDescription}`, []);
  const filtered = useFiltered(user.groups, search, getSearchStr);
  const removingGroup = removingGroupId ? user.groups.find((g) => g.groupId === removingGroupId) : null;

  return (
    <>
      <Button startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
        Back to Users List
      </Button>
      <Typography variant="h1" sx={{ mb: 4 }}>
        Manage User Access
      </Typography>
      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <Avatar sx={{ width: 56, height: 56, fontSize: 24, bgcolor: 'text.primary', color: 'background.paper' }}>{getUserInitial(user)}</Avatar>
        <Stack>
          <Typography variant="h6" component="h2">
            {user.displayName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user.username}
          </Typography>
        </Stack>
      </Stack>
      {viewAlert && (
        <Alert severity={viewAlert.type} onClose={() => setViewAlert(null)} sx={{ mb: 2 }}>
          {viewAlert.message}
        </Alert>
      )}
      <ListingTable.Container>
        <ListingTable.Toolbar
          searchSlot={<SearchField value={search} onChange={setSearch} />}
          actions={
            !isSelf &&
            canManageUsers && (
              <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setAssigning(true)}>
                Assign Groups
              </Button>
            )
          }
        />
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Group Name</ListingTable.Cell>
              <ListingTable.Cell>Description</ListingTable.Cell>
              {!isSelf && canManageUsers && <ListingTable.Cell align="right">Action</ListingTable.Cell>}
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {filtered.length === 0 ? (
              <ListingTable.Row>
                <ListingTable.Cell colSpan={!isSelf && canManageUsers ? 3 : 2} align="center">
                  No groups assigned
                </ListingTable.Cell>
              </ListingTable.Row>
            ) : (
              filtered.map((g) => (
                <ListingTable.Row key={g.groupId}>
                  <ListingTable.Cell>{g.groupName}</ListingTable.Cell>
                  <ListingTable.Cell>{g.groupDescription}</ListingTable.Cell>
                  {!isSelf && canManageUsers && (
                    <ListingTable.Cell align="right">
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error" aria-label={`Remove ${g.groupName} group`} onClick={() => setRemovingGroupId(g.groupId)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </ListingTable.Cell>
                  )}
                </ListingTable.Row>
              ))
            )}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>
      {assigning && <AssignGroupsDialog orgHandler={orgHandler} user={user} onClose={() => setAssigning(false)} onAssigned={() => setViewAlert({ type: 'success', message: 'Groups assigned successfully.' })} />}
      {removingGroup && (
        <Dialog open onClose={() => setRemovingGroupId(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Remove Group</DialogTitle>
          <DialogContent>
            <Typography>
              Remove <strong>{user.displayName}</strong> from <strong>{removingGroup.groupName}</strong>?
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRemovingGroupId(null)}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              disabled={removeUserMutation.isPending}
              onClick={() =>
                removeUserMutation.mutate(
                  { groupId: removingGroup.groupId, userId: user.userId },
                  {
                    onSuccess: () => {
                      setRemovingGroupId(null);
                      setViewAlert({ type: 'success', message: 'Group removed successfully.' });
                    },
                    onError: (error) => {
                      setRemovingGroupId(null);
                      setViewAlert({ type: 'error', message: error?.message ?? 'Failed to remove user from group. Please try again.' });
                    },
                  },
                )
              }>
              Remove
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}

export default function EditUser(): JSX.Element {
  const { orgHandler = 'default', userId = '' } = useParams();
  const navigate = useAppNavigate();
  const { data: users, isLoading } = useUsers(orgHandler);
  const backUrl = orgAccessControlUrl(orgHandler, 'users');

  if (isLoading)
    return (
      <PageContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );

  const user = users?.find((u) => u.userId === userId);
  if (!user)
    return (
      <PageContent>
        <Typography>User not found</Typography>
      </PageContent>
    );

  return (
    <PageContent>
      <UserDetailView orgHandler={orgHandler} user={user} onBack={() => navigate(backUrl)} />
    </PageContent>
  );
}
