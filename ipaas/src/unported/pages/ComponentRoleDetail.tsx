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
  Tooltip,
  Typography,
} from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, useMemo, useCallback, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import SearchField from '../../components/SearchField';
import { useRoleDetail, useRoleGroups, useGroups, useAddRolesToGroup, useRemoveRoleFromGroup } from '../../hooks/useAuth';
import { Permissions, ALL_ROLE_MODIFY_PERMISSIONS } from '../../constants/permissions';
import { useAccessControl } from '../../contexts/AccessControlContext';
import type { RoleGroupMapping, Group } from '../../types/auth';
import { useAllEnvironments } from '../../hooks/useEnvironments';
import { useProjectByHandler } from '../../hooks/useProjects';
import { useComponentByHandler } from '../../hooks/useComponents';
import { componentAccessControlUrl } from '../../paths';

function Loading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
      <CircularProgress />
    </Box>
  );
}

function AssignRoleToGroupsDialog({
  orgHandler,
  projectId,
  componentId,
  roleId,
  roleName,
  existingGroupIds,
  onClose,
  onAssigned,
}: {
  orgHandler: string;
  projectId: string;
  componentId: string;
  roleId: string;
  roleName: string;
  existingGroupIds: string[];
  onClose: () => void;
  onAssigned?: () => void;
}) {
  const { data: allGroups = [] } = useGroups(orgHandler, projectId, componentId);
  const { data: allEnvironments = [] } = useAllEnvironments();
  const mutation = useAddRolesToGroup(orgHandler, projectId, componentId);
  const [selected, setSelected] = useState<Group[]>([]);
  const [envMode, setEnvMode] = useState<'all' | 'selected'>('all');
  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const available = allGroups.filter((g) => !existingGroupIds.includes(g.groupId));
  const pending = mutation.isPending;

  const assign = async () => {
    if (envMode === 'selected' && selectedEnvs.length === 0) {
      return;
    }
    setErrorMsg('');
    const envUuid = envMode === 'selected' && selectedEnvs.length > 0 ? selectedEnvs[0] : undefined;

    const promises = selected.map((g) =>
      mutation.mutateAsync({ groupId: g.groupId, roleIds: [roleId], envUuid }).then(
        () => ({ success: true, groupName: g.groupName }),
        (error) => ({ success: false, groupName: g.groupName, error }),
      ),
    );

    const results = await Promise.all(promises);
    const failures = results.filter((r) => !r.success);

    if (failures.length === 0) {
      onAssigned?.();
      onClose();
    } else {
      const failedGroups = failures.map((f) => f.groupName).join(', ');
      setErrorMsg(`Failed to assign role to: ${failedGroups}`);
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

const mappingLevel = (m: { projectUuid?: string | null; integrationUuid?: string | null }) => (m.integrationUuid ? 'Component' : m.projectUuid ? 'Project' : 'Organization');
const envLabel = (m: { envUuid?: string | null }, environments: { id: string; name: string }[]) => {
  if (!m.envUuid) return 'All';
  const env = environments.find((e) => e.id === m.envUuid);
  return env?.name ?? m.envUuid;
};

export default function ComponentRoleDetail(): JSX.Element {
  const { orgHandler = 'default', projectHandler = '', componentHandler = '', roleId = '' } = useParams();
  const navigate = useAppNavigate();
  const { hasAnyPermission } = useAccessControl();
  const { data: projectData, isLoading: loadingProject } = useProjectByHandler(projectHandler);
  const projectId = projectData?.id ?? '';
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, componentHandler);
  const componentId = component?.id;
  const roleModifyPerms = [...ALL_ROLE_MODIFY_PERMISSIONS, Permissions.PROJECT_EDIT, Permissions.PROJECT_MANAGE, Permissions.INTEGRATION_EDIT, Permissions.INTEGRATION_MANAGE];

  const { data: role, isLoading: loadingRole } = useRoleDetail(orgHandler, roleId, projectId, componentId);
  const { data: roleGroups = [], isLoading: loadingGroups } = useRoleGroups(orgHandler, roleId, projectId, componentId);
  const { data: allEnvironments = [] } = useAllEnvironments();
  const removeMutation = useRemoveRoleFromGroup(orgHandler);
  const [search, setSearch] = useState('');
  const [addingGroups, setAddingGroups] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<RoleGroupMapping | null>(null);
  const [pageAlert, setPageAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const actionsVisible = hasAnyPermission(roleModifyPerms, projectId || undefined, componentId);
  const colCount = actionsVisible ? 4 : 3;
  const getSearchStr = useCallback((g: RoleGroupMapping) => (g.groupName ?? '') + (g.groupId ?? ''), []);
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return roleGroups;
    const s = search.toLowerCase();
    return roleGroups.filter((g) => getSearchStr(g).toLowerCase().includes(s));
  }, [roleGroups, search, getSearchStr]);

  const onBack = () => navigate(componentAccessControlUrl(orgHandler, projectHandler, componentHandler, 'roles'));
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

  if (loadingProject || loadingComponent || loadingRole)
    return (
      <PageContent>
        <Loading />
      </PageContent>
    );
  if (!component)
    return (
      <PageContent>
        <Typography>Component not found</Typography>
      </PageContent>
    );
  if (!role)
    return (
      <PageContent>
        <Typography>Role not found</Typography>
      </PageContent>
    );

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
      {pageAlert && (
        <Alert severity={pageAlert.type} onClose={() => setPageAlert(null)} sx={{ mb: 2 }}>
          {pageAlert.message}
        </Alert>
      )}
      <ListingTable.Container>
        <ListingTable.Toolbar
          searchSlot={<SearchField value={search} onChange={setSearch} />}
          actions={
            actionsVisible && (
              <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setAddingGroups(true)}>
                Add Group
              </Button>
            )
          }
        />
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Group Name</ListingTable.Cell>
              <ListingTable.Cell>Mapping Level</ListingTable.Cell>
              <ListingTable.Cell align="center">Applicable Environment</ListingTable.Cell>
              {actionsVisible && <ListingTable.Cell align="right">Actions</ListingTable.Cell>}
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
                  <ListingTable.Cell>
                    <Chip label={mappingLevel(g)} size="small" />
                  </ListingTable.Cell>
                  <ListingTable.Cell align="center">
                    <Chip label={envLabel(g, allEnvironments)} size="small" />
                  </ListingTable.Cell>
                  {actionsVisible && (
                    <ListingTable.Cell align="right">
                      <Tooltip title={!g.integrationUuid ? 'Org/Project-level mapping' : 'Remove'}>
                        <span style={{ display: 'inline-flex' }}>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={!g.integrationUuid ? 'Org/Project-level mapping — cannot remove' : `Remove ${g.groupName ?? g.groupId} from role`}
                            onClick={() => handleDeleteGroup(g)}
                            disabled={removeMutation.isPending || !g.integrationUuid}>
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
      </ListingTable.Container>

      {addingGroups && componentId && (
        <AssignRoleToGroupsDialog
          orgHandler={orgHandler}
          projectId={projectId}
          componentId={componentId}
          roleId={roleId}
          roleName={role.roleName}
          existingGroupIds={roleGroups.map((g) => g.groupId)}
          onClose={() => setAddingGroups(false)}
          onAssigned={() => setPageAlert({ type: 'success', message: 'Role assigned to groups successfully.' })}
        />
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
