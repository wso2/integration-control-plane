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
  Box,
  Button,
  Checkbox,
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
  Radio,
  RadioGroup,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  PageContent,
} from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft, ChevronDown, ChevronUp, Link2, Lock, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, useMemo, useCallback, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import SearchField from '../../components/SearchField';
import { useRoleDetail, useAllPermissions, useRoleGroups, useUpdateRole, useGroups, useAddRolesToGroup, useRemoveRoleFromGroup } from '../../hooks/useAuth';
import type { Permission, RoleGroupMapping, Group } from '../../types/auth';
import { useAllEnvironments } from '../../hooks/useEnvironments';
import { orgAccessControlUrl } from '../../paths';
import Authorized from '../../components/Authorized';
import { ALL_ROLE_MODIFY_PERMISSIONS } from '../../constants/permissions';
import { useAccessControl } from '../../contexts/AccessControlContext';

function Loading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
      <CircularProgress />
    </Box>
  );
}

function PermissionsEditor({ allPermissions, selectedIds, onChange }: { allPermissions: Record<string, Permission[]>; selectedIds: Set<string>; onChange: (ids: Set<string>) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (domain: string) => setExpanded((p) => ({ ...p, [domain]: !p[domain] }));
  const toggleDomain = (_domain: string, perms: Permission[]) => {
    const allSelected = perms.every((p) => selectedIds.has(p.permissionId));
    const next = new Set(selectedIds);
    perms.forEach((p) => (allSelected ? next.delete(p.permissionId) : next.add(p.permissionId)));
    onChange(next);
  };
  const togglePerm = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Select permissions to assign to this role
      </Typography>
      {Object.entries(allPermissions).map(([domain, perms]) => {
        const count = perms.filter((p) => selectedIds.has(p.permissionId)).length;
        const allChecked = count === perms.length;
        const indeterminate = count > 0 && count < perms.length;
        const isExpanded = expanded[domain] ?? false;
        return (
          <Box key={domain} sx={{ mb: 1 }}>
            <Stack direction="row" alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => toggle(domain)}>
              <Checkbox checked={allChecked} indeterminate={indeterminate} inputProps={{ 'aria-label': domain }} onClick={(e) => e.stopPropagation()} onChange={() => toggleDomain(domain, perms)} />
              <Typography variant="subtitle2" component="p" sx={{ flexGrow: 1 }}>
                {domain} ({count}/{perms.length})
              </Typography>
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Stack>
            {isExpanded && (
              <Box sx={{ pl: 4 }}>
                {perms.map((p) => (
                  <Box key={p.permissionId}>
                    <FormControlLabel control={<Checkbox checked={selectedIds.has(p.permissionId)} onChange={() => togglePerm(p.permissionId)} />} label={p.permissionName} />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function AssignRoleToGroupsDialog({ orgHandler, roleId, roleName, existingGroupIds, onClose, onAssigned }: { orgHandler: string; roleId: string; roleName: string; existingGroupIds: string[]; onClose: () => void; onAssigned?: () => void }) {
  const { data: allGroups = [] } = useGroups(orgHandler);
  const { data: allEnvironments = [] } = useAllEnvironments();
  const mutation = useAddRolesToGroup(orgHandler);
  const [selected, setSelected] = useState<Group[]>([]);
  const [envMode, setEnvMode] = useState<'all' | 'selected'>('all');
  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const available = allGroups.filter((g) => !existingGroupIds.includes(g.groupId));
  const pending = mutation.isPending;
  const assign = async () => {
    if (envMode === 'selected' && selectedEnvs.length === 0) {
      return;
    }
    setErrorMsg('');
    const envUuid = envMode === 'selected' && selectedEnvs.length > 0 ? selectedEnvs[0] : undefined;
    const results = await Promise.all(
      selected.map((g) =>
        mutation.mutateAsync({ groupId: g.groupId, roleIds: [roleId], envUuid }).then(
          () => ({ success: true, groupName: g.groupName }),
          (error) => ({ success: false, groupName: g.groupName, error }),
        ),
      ),
    );
    const failures = results.filter((r) => !r.success);
    if (failures.length === 0) {
      onAssigned?.();
      onClose();
    } else {
      setErrorMsg(`Failed to assign role to: ${failures.map((f) => f.groupName).join(', ')}`);
    }
  };
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Assign Role to Groups</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select groups to assign the role &quot;{roleName}&quot; to
        </Typography>
        {errorMsg && (
          <Alert severity="error" onClose={() => setErrorMsg('')} sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}
        <Stack spacing={2}>
          <Autocomplete
            multiple
            options={available}
            getOptionLabel={(g) => g.groupName}
            value={selected}
            onChange={(_, v) => setSelected(v)}
            isOptionEqualToValue={(a, b) => a.groupId === b.groupId}
            renderInput={(params) => <TextField {...params} label="Groups" placeholder="Select groups" />}
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
          Assign
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const mappingLevel = (m: { projectUuid?: string | null }) => (m.projectUuid ? 'Project' : 'Organization');
const envLabel = (m: { envUuid?: string | null }, environments: { id: string; name: string }[]) => {
  if (!m.envUuid) return 'All';
  const env = environments.find((e) => e.id === m.envUuid);
  return env?.name ?? m.envUuid;
};

export default function RoleDetail(): JSX.Element {
  const { orgHandler = 'default', roleId = '' } = useParams();
  const navigate = useAppNavigate();
  const roleModifyPerms: string[] = [...ALL_ROLE_MODIFY_PERMISSIONS];
  const { hasAnyPermission } = useAccessControl();
  const canModifyRole = hasAnyPermission(roleModifyPerms);
  const colCount = canModifyRole ? 5 : 4;
  const { data: role, isLoading: loadingRole } = useRoleDetail(orgHandler, roleId);
  const { data: allPermsData } = useAllPermissions();
  const { data: roleGroups = [], isLoading: loadingGroups } = useRoleGroups(orgHandler, roleId);
  const { data: allEnvironments = [] } = useAllEnvironments();
  const updateMutation = useUpdateRole(orgHandler);
  const removeMutation = useRemoveRoleFromGroup(orgHandler);
  const [subTab, setSubTab] = useState<'permissions' | 'groups'>('permissions');
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState('');
  const [addingGroups, setAddingGroups] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<RoleGroupMapping | null>(null);
  const [pageAlert, setPageAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const originalPermIds = useMemo(() => new Set(role?.permissions.map((p) => p.permissionId) ?? []), [role]);
  const permIds = useMemo(() => selectedIds ?? originalPermIds, [selectedIds, originalPermIds]);
  const grouped = allPermsData?.groupedByDomain ?? {};
  const getSearchStr = useCallback((g: RoleGroupMapping) => (g.groupName ?? '') + (g.groupId ?? ''), []);
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return roleGroups;
    const s = search.toLowerCase();
    return roleGroups.filter((g) => getSearchStr(g).toLowerCase().includes(s));
  }, [roleGroups, search, getSearchStr]);
  const onBack = () => navigate(orgAccessControlUrl(orgHandler, 'roles'));
  const handleDeleteGroup = (group: RoleGroupMapping) => {
    setDeletingGroup(group);
  };
  const confirmDelete = () => {
    if (deletingGroup) {
      const name = deletingGroup.groupName ?? deletingGroup.groupId;
      removeMutation.mutate(
        { groupId: deletingGroup.groupId, mappingId: deletingGroup.id },
        {
          onSuccess: () => {
            setDeletingGroup(null);
            setPageAlert({ type: 'success', message: `Group '${name}' removed from role successfully.` });
          },
          onError: (error) => {
            setDeletingGroup(null);
            setPageAlert({ type: 'error', message: (error as Error).message ?? 'Failed to remove group from role. Please try again.' });
          },
        },
      );
    }
  };

  if (loadingRole)
    return (
      <PageContent>
        <Loading />
      </PageContent>
    );
  if (!role)
    return (
      <PageContent>
        <Typography>Role not found</Typography>
      </PageContent>
    );
  const dirty = selectedIds !== null && (selectedIds.size !== originalPermIds.size || [...selectedIds].some((id) => !originalPermIds.has(id)));

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
        Back to Role List
      </Button>
      <Typography variant="h1" sx={{ mb: 4 }}>
        Manage Role
      </Typography>
      <Stack sx={{ mb: 2 }}>
        <Typography variant="h6" component="h2">
          Role : {role.roleName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Description : {role.description}
        </Typography>
      </Stack>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={subTab}
        onChange={(_, v) => {
          if (v !== null) {
            setSubTab(v);
            setPageAlert(null);
          }
        }}
        sx={{ mb: 2 }}>
        <ToggleButton value="permissions">
          <Lock size={16} style={{ marginRight: 8 }} />
          Permissions
        </ToggleButton>
        <ToggleButton value="groups">
          <Link2 size={16} style={{ marginRight: 8 }} />
          Groups
        </ToggleButton>
      </ToggleButtonGroup>
      {pageAlert && (
        <Alert severity={pageAlert.type} onClose={() => setPageAlert(null)} sx={{ mb: 2 }}>
          {pageAlert.message}
        </Alert>
      )}
      {subTab === 'permissions' && (
        <>
          <PermissionsEditor allPermissions={grouped} selectedIds={permIds} onChange={setSelectedIds} />
          <Authorized permissions={roleModifyPerms}>
            <Stack direction="row" sx={{ mt: 2 }}>
              <Button
                variant="contained"
                disabled={!dirty || updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate(
                    { roleId, roleName: role.roleName, description: role.description, permissionIds: [...permIds] },
                    {
                      onSuccess: () => {
                        setSelectedIds(null);
                        setPageAlert({ type: 'success', message: 'Permissions saved successfully.' });
                      },
                      onError: (error) => setPageAlert({ type: 'error', message: (error as Error).message ?? 'Failed to save permissions. Please try again.' }),
                    },
                  )
                }>
                Save Permissions
              </Button>
            </Stack>
          </Authorized>
        </>
      )}
      {subTab === 'groups' && (
        <>
          <ListingTable.Container>
            <ListingTable.Toolbar
              searchSlot={<SearchField value={search} onChange={setSearch} />}
              actions={
                <Authorized permissions={roleModifyPerms}>
                  <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setAddingGroups(true)}>
                    Add Groups
                  </Button>
                </Authorized>
              }
            />
            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Group Name</ListingTable.Cell>
                  <ListingTable.Cell>Description</ListingTable.Cell>
                  <ListingTable.Cell>Mapping Level</ListingTable.Cell>
                  <ListingTable.Cell align="center">Applicable Environment</ListingTable.Cell>
                  {canModifyRole && <ListingTable.Cell align="right">Actions</ListingTable.Cell>}
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {loadingGroups ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={colCount}>
                      <Loading />
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : filteredGroups.length === 0 ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={colCount} align="center">
                      No records to display
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : (
                  filteredGroups.map((g) => (
                    <ListingTable.Row key={g.id}>
                      <ListingTable.Cell>{g.groupName ?? g.groupId}</ListingTable.Cell>
                      <ListingTable.Cell>{g.groupDescription}</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Chip label={mappingLevel(g)} size="small" />
                      </ListingTable.Cell>
                      <ListingTable.Cell align="center">
                        <Chip label={envLabel(g, allEnvironments)} size="small" />
                      </ListingTable.Cell>
                      <Authorized permissions={roleModifyPerms}>
                        <ListingTable.Cell align="right">
                          <Tooltip title="Remove">
                            <IconButton size="small" color="error" aria-label={`Remove ${g.groupName ?? g.groupId} from role`} onClick={() => handleDeleteGroup(g)} disabled={removeMutation.isPending}>
                              <Trash2 size={16} />
                            </IconButton>
                          </Tooltip>
                        </ListingTable.Cell>
                      </Authorized>
                    </ListingTable.Row>
                  ))
                )}
              </ListingTable.Body>
            </ListingTable>
          </ListingTable.Container>
          {addingGroups && (
            <AssignRoleToGroupsDialog
              orgHandler={orgHandler}
              roleId={roleId}
              roleName={role.roleName}
              existingGroupIds={roleGroups.map((g) => g.groupId)}
              onClose={() => setAddingGroups(false)}
              onAssigned={() => setPageAlert({ type: 'success', message: 'Role assigned to groups successfully.' })}
            />
          )}
        </>
      )}

      {deletingGroup && (
        <Dialog open onClose={() => setDeletingGroup(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Remove Group from Role</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to remove the group <strong>{deletingGroup.groupName ?? deletingGroup.groupId}</strong> from this role?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeletingGroup(null)}>Cancel</Button>
            <Button variant="contained" color="error" disabled={removeMutation.isPending} onClick={confirmDelete}>
              Remove
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </PageContent>
  );
}
