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

import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  ListingTable,
  MenuItem,
  PageContent,
  Radio,
  RadioGroup,
  Stack,
  TablePagination,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft, Lock, Plus, Trash2, Users } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { Permissions, ALL_ROLE_MODIFY_PERMISSIONS } from '../../constants/permissions';
import SearchField from '../../components/SearchField';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { useGroups, useGroupRoles, useGroupUsers, useAddRolesToGroup, useRemoveRoleFromGroup, useAddUsersToGroup, useRemoveUserFromGroup, useUsers, useRoles } from '../../hooks/useAuth';
import { useAllEnvironments } from '../../hooks/useEnvironments';
import type { Group, Role } from '../../types/auth';
import { orgAccessControlUrl } from '../../paths';
import { FormDialog } from '../../components/Settings/AccessControl/shared';
import { useFiltered, mappingLevel, envLabel, getUserInitial } from '../components/Settings/AccessControl/utils';

function AddRolesToGroupDialog({ orgHandler, groupId, existingRoleIds, onClose, onAdded }: { orgHandler: string; groupId: string; existingRoleIds: string[]; onClose: () => void; onAdded?: () => void }) {
  const { data: allRoles = [] } = useRoles(orgHandler);
  const { data: allEnvironments = [] } = useAllEnvironments();
  const mutation = useAddRolesToGroup(orgHandler);
  const [selected, setSelected] = useState<Role[]>([]);
  const [envMode, setEnvMode] = useState<'all' | 'selected'>('all');
  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([]);
  const [assignError, setAssignError] = useState<string | null>(null);
  const available = allRoles.filter((r) => !existingRoleIds.includes(r.roleId));
  const pending = mutation.isPending;

  const assign = () => {
    if (envMode === 'selected' && selectedEnvs.length === 0) return;
    setAssignError(null);
    const envUuid = envMode === 'selected' && selectedEnvs.length > 0 ? selectedEnvs[0] : undefined;
    mutation.mutate(
      { groupId, roleIds: selected.map((r) => r.roleId), envUuid },
      {
        onSuccess: () => {
          onAdded?.();
          onClose();
        },
        onError: (error) => setAssignError(error.message ?? 'Failed to add roles to group. Please try again.'),
      },
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Roles to Group</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {assignError && (
            <Alert severity="error" onClose={() => setAssignError(null)}>
              {assignError}
            </Alert>
          )}
          <Autocomplete
            multiple
            options={available}
            getOptionLabel={(r) => r.roleName}
            value={selected}
            onChange={(_, v) => setSelected(v)}
            isOptionEqualToValue={(a, b) => a.roleId === b.roleId}
            renderInput={(params) => <TextField {...params} label="Roles" placeholder="Select roles to add to group" />}
          />
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, bgcolor: 'background.paper' }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Applicable Environments
            </Typography>
            <RadioGroup value={envMode} onChange={(e) => setEnvMode(e.target.value as 'all' | 'selected')}>
              <FormControlLabel value="all" control={<Radio />} label="All Environments" />
              <FormControlLabel value="selected" control={<Radio />} label="Selected Environments" />
            </RadioGroup>
            {envMode === 'selected' && (
              <TextField select fullWidth label="Select applicable environments" value={selectedEnvs[0] || ''} onChange={(e) => setSelectedEnvs(e.target.value ? [e.target.value] : [])} sx={{ mt: 2 }}>
                {allEnvironments.map((env) => (
                  <MenuItem key={env.id} value={env.id}>
                    {env.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={selected.length === 0 || pending || (envMode === 'selected' && selectedEnvs.length === 0)} onClick={assign}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddUsersToGroupDialog({ orgHandler, groupId, existingUserIds, onClose, onAdded }: { orgHandler: string; groupId: string; existingUserIds: string[]; onClose: () => void; onAdded?: () => void }) {
  const { data: allUsers = [] } = useUsers(orgHandler);
  const mutation = useAddUsersToGroup(orgHandler);
  const [selected, setSelected] = useState([] as (typeof allUsers)[number][]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const available = allUsers.filter((u) => !existingUserIds.includes(u.userId));
  return (
    <FormDialog
      open
      onClose={onClose}
      primaryLabel="Add"
      primaryDisabled={selected.length === 0 || mutation.isPending}
      onPrimary={() =>
        mutation.mutate(
          { groupId, userIds: selected.map((u) => u.userId) },
          {
            onSuccess: () => {
              onAdded?.();
              onClose();
            },
            onError: (error) => setErrorMessage(error?.message ?? 'Failed to add users to group. Please try again.'),
          },
        )
      }
      title="Add Users to Group">
      {errorMessage && (
        <Alert severity="error" onClose={() => setErrorMessage(null)} sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}
      <Autocomplete
        multiple
        options={available}
        getOptionLabel={(u) => `${u.displayName} (${u.username})`}
        value={selected}
        onChange={(_, v) => setSelected(v)}
        isOptionEqualToValue={(a, b) => a.userId === b.userId}
        renderInput={(params) => <TextField {...params} label="Users" placeholder="Select users to add" />}
      />
    </FormDialog>
  );
}

export function GroupDetailView({ orgHandler, group, onBack, projectId, componentId, showUsers = true }: { orgHandler: string; group: Group; onBack: () => void; projectId?: string; componentId?: string; showUsers?: boolean }) {
  const roleModifyPerms: string[] = [...ALL_ROLE_MODIFY_PERMISSIONS];
  const { hasAnyPermission } = useAccessControl();
  const canManageGroups = hasAnyPermission([Permissions.USER_MANAGE_GROUPS]);
  const canModifyRoles = hasAnyPermission(roleModifyPerms);
  const { data: groupRoles = [], isLoading: loadingRoles, isError: rolesError } = useGroupRoles(orgHandler, group.groupId, projectId, componentId);
  const { data: groupUsers = [], isLoading: loadingUsers, isError: usersError } = useGroupUsers(orgHandler, group.groupId);
  const { data: allEnvironments = [] } = useAllEnvironments();
  const removeRoleMutation = useRemoveRoleFromGroup(orgHandler);
  const removeUserMutation = useRemoveUserFromGroup(orgHandler);
  const [subTab, setSubTab] = useState<'users' | 'roles'>(showUsers ? 'users' : 'roles');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [addingRoles, setAddingRoles] = useState(false);
  const [addingUsers, setAddingUsers] = useState(false);
  const [removingUser, setRemovingUser] = useState<{ userId: string; displayName: string; username: string } | null>(null);
  const [removingRole, setRemovingRole] = useState<{ id: number; roleName: string } | null>(null);
  const [viewAlert, setViewAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const filteredUsers = useFiltered(groupUsers, search, (u) => `${u.displayName} ${u.username}`);
  const filteredRoles = useFiltered(groupRoles, search, (r) => `${r.roleName} ${r.roleDescription ?? ''}`);
  const maxPageUsers = Math.max(0, Math.ceil(filteredUsers.length / rowsPerPage) - 1);
  const maxPageRoles = Math.max(0, Math.ceil(filteredRoles.length / rowsPerPage) - 1);
  const safePageUsers = Math.min(page, maxPageUsers);
  const safePageRoles = Math.min(page, maxPageRoles);
  const paginatedUsers = filteredUsers.slice(safePageUsers * rowsPerPage, safePageUsers * rowsPerPage + rowsPerPage);
  const paginatedRoles = filteredRoles.slice(safePageRoles * rowsPerPage, safePageRoles * rowsPerPage + rowsPerPage);

  return (
    <Box>
      <Button startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
        Back to Group List
      </Button>
      <Typography variant="h1" sx={{ mb: 4 }}>
        Manage Group
      </Typography>
      <Stack sx={{ mb: 2 }}>
        <Typography variant="h6" component="h2">
          Group : {group.groupName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Description : {group.description}
        </Typography>
      </Stack>
      {showUsers && (
        <ToggleButtonGroup
          exclusive
          size="small"
          value={subTab}
          onChange={(_, v) => {
            if (v !== null) {
              setSubTab(v);
              setSearch('');
              setPage(0);
              setViewAlert(null);
            }
          }}
          sx={{ mb: 2 }}>
          <ToggleButton value="users">
            <Users size={16} style={{ marginRight: 8 }} />
            Users
          </ToggleButton>
          <ToggleButton value="roles">
            <Lock size={16} style={{ marginRight: 8 }} />
            Roles
          </ToggleButton>
        </ToggleButtonGroup>
      )}
      {viewAlert && (
        <Alert severity={viewAlert.type} onClose={() => setViewAlert(null)} sx={{ mb: 2 }}>
          {viewAlert.message}
        </Alert>
      )}
      {subTab === 'users' && (
        <>
          <ListingTable.Container>
            <ListingTable.Toolbar
              searchSlot={<SearchField value={search} onChange={setSearch} />}
              actions={
                canManageGroups && (
                  <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setAddingUsers(true)}>
                    Add Users
                  </Button>
                )
              }
            />
            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>User</ListingTable.Cell>
                  <ListingTable.Cell>Username</ListingTable.Cell>
                  {canManageGroups && <ListingTable.Cell align="right">Action</ListingTable.Cell>}
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {loadingUsers ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={canManageGroups ? 3 : 2} align="center">
                      <CircularProgress size={24} />
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : usersError ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={canManageGroups ? 3 : 2} align="center">
                      Failed to load users
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : filteredUsers.length === 0 ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={canManageGroups ? 3 : 2} align="center">
                      No records to display
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : (
                  paginatedUsers.map((u) => (
                    <ListingTable.Row key={u.userId}>
                      <ListingTable.Cell>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>{getUserInitial(u)}</Avatar>
                          {u.displayName}
                        </Stack>
                      </ListingTable.Cell>
                      <ListingTable.Cell>{u.username}</ListingTable.Cell>
                      {canManageGroups && (
                        <ListingTable.Cell align="right">
                          <Tooltip title="Remove">
                            <IconButton size="small" color="error" aria-label={`Remove ${u.displayName} from group`} onClick={() => setRemovingUser(u)}>
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
            <TablePagination
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
              component="div"
              count={filteredUsers.length}
              page={safePageUsers}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />
          </ListingTable.Container>
          {addingUsers && (
            <AddUsersToGroupDialog
              orgHandler={orgHandler}
              groupId={group.groupId}
              existingUserIds={groupUsers.map((u) => u.userId)}
              onClose={() => setAddingUsers(false)}
              onAdded={() => setViewAlert({ type: 'success', message: 'User(s) added to group successfully.' })}
            />
          )}
          {removingUser && (
            <Dialog open onClose={() => setRemovingUser(null)} maxWidth="sm" fullWidth>
              <DialogTitle>Remove User from Group</DialogTitle>
              <DialogContent>
                <DialogContentText>
                  Are you sure you want to remove <strong>{removingUser.displayName}</strong> from this group?
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setRemovingUser(null)}>Cancel</Button>
                <Button
                  variant="contained"
                  color="error"
                  disabled={removeUserMutation.isPending}
                  onClick={() =>
                    removeUserMutation.mutate(
                      { groupId: group.groupId, userId: removingUser.userId },
                      {
                        onSuccess: () => {
                          setRemovingUser(null);
                          setViewAlert({ type: 'success', message: 'User removed from group successfully.' });
                        },
                        onError: (error) => {
                          setRemovingUser(null);
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
      )}
      {subTab === 'roles' && (
        <>
          <ListingTable.Container>
            <ListingTable.Toolbar
              searchSlot={<SearchField value={search} onChange={setSearch} />}
              actions={
                canModifyRoles && (
                  <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setAddingRoles(true)}>
                    Add Roles
                  </Button>
                )
              }
            />
            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Role Name</ListingTable.Cell>
                  <ListingTable.Cell align="center">Mapping Level</ListingTable.Cell>
                  <ListingTable.Cell align="center">Applicable Environment</ListingTable.Cell>
                  {canModifyRoles && <ListingTable.Cell align="right">Action</ListingTable.Cell>}
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {loadingRoles ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={canModifyRoles ? 4 : 3} align="center">
                      <CircularProgress size={24} />
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : rolesError ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={canModifyRoles ? 4 : 3} align="center">
                      Failed to load roles
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : filteredRoles.length === 0 ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={canModifyRoles ? 4 : 3} align="center">
                      No records to display
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : (
                  paginatedRoles.map((r) => (
                    <ListingTable.Row key={r.id}>
                      <ListingTable.Cell>{r.roleName}</ListingTable.Cell>
                      <ListingTable.Cell align="center">
                        <Chip label={mappingLevel(r)} size="small" />
                      </ListingTable.Cell>
                      <ListingTable.Cell align="center">
                        <Chip label={envLabel(r, allEnvironments)} size="small" />
                      </ListingTable.Cell>
                      {canModifyRoles && (
                        <ListingTable.Cell align="right">
                          <Tooltip title={componentId ? (!r.integrationUuid ? 'Org/Project-level mapping' : 'Remove') : projectId && !r.projectUuid ? 'Org-level mapping' : 'Remove'}>
                            <span style={{ display: 'inline-flex' }}>
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`Remove ${r.roleName} from group`}
                                onClick={() => setRemovingRole({ id: r.id, roleName: r.roleName })}
                                disabled={componentId ? !r.integrationUuid : Boolean(projectId && !r.projectUuid)}>
                                <Trash2 size={16} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </ListingTable.Cell>
                      )}
                    </ListingTable.Row>
                  ))
                )}
              </ListingTable.Body>
            </ListingTable>
            <TablePagination
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
              component="div"
              count={filteredRoles.length}
              page={safePageRoles}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />
          </ListingTable.Container>
          {addingRoles && (
            <AddRolesToGroupDialog
              orgHandler={orgHandler}
              groupId={group.groupId}
              existingRoleIds={groupRoles.map((r) => r.roleId)}
              onClose={() => setAddingRoles(false)}
              onAdded={() => setViewAlert({ type: 'success', message: 'Role(s) added to group successfully.' })}
            />
          )}
          {removingRole && (
            <Dialog open onClose={() => setRemovingRole(null)} maxWidth="sm" fullWidth>
              <DialogTitle>Remove Role from Group</DialogTitle>
              <DialogContent>
                <DialogContentText>
                  Are you sure you want to remove the role <strong>{removingRole.roleName}</strong> from this group?
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setRemovingRole(null)}>Cancel</Button>
                <Button
                  variant="contained"
                  color="error"
                  disabled={removeRoleMutation.isPending}
                  onClick={() =>
                    removeRoleMutation.mutate(
                      { groupId: group.groupId, mappingId: removingRole.id },
                      {
                        onSuccess: () => {
                          setRemovingRole(null);
                          setViewAlert({ type: 'success', message: 'Role removed from group successfully.' });
                        },
                        onError: (error) => {
                          setRemovingRole(null);
                          setViewAlert({ type: 'error', message: error?.message ?? 'Failed to remove role from group. Please try again.' });
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
      )}
    </Box>
  );
}

export default function EditGroup(): JSX.Element {
  const { orgHandler = 'default', groupId = '' } = useParams();
  const navigate = useAppNavigate();
  const { data: groups, isLoading, isError } = useGroups(orgHandler);
  const backUrl = orgAccessControlUrl(orgHandler, 'groups');

  if (isLoading)
    return (
      <PageContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  if (isError)
    return (
      <PageContent>
        <Typography>Failed to load groups</Typography>
      </PageContent>
    );

  const group = groups?.find((g) => g.groupId === groupId);
  if (!group)
    return (
      <PageContent>
        <Typography>Group not found</Typography>
      </PageContent>
    );

  return (
    <PageContent>
      <GroupDetailView orgHandler={orgHandler} group={group} onBack={() => navigate(backUrl)} />
    </PageContent>
  );
}
