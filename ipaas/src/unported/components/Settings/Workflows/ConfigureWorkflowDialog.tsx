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

import { Autocomplete, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useRoles, useUsers } from '../../../../hooks/useAuth';
import { useCreateWorkflowConfig, useUpdateWorkflowConfig } from '../../../hooks/useWorkflows';
import type { Role, User } from '../../../../types/auth';
import type { OrgWorkflowConfig, WorkflowDefinition } from '../../../../types/workflow';

// The `admin` role can always approve and is force-included.
// NOTE: `assigneeRoles`/`assignees` use the role handle + user id the workflow
// backend expects; we map these to ICP's `roleName`/`userId`. Verify against the
// live backend that the handle is `roleName` (and not a separate slug).
const ADMIN_ROLE = 'admin';

interface ConfigureWorkflowDialogProps {
  orgHandler: string;
  definition: WorkflowDefinition;
  existingConfig?: OrgWorkflowConfig;
  onClose: () => void;
  onSaved: (name: string) => void;
  onError: (message: string) => void;
}

/** Configure (create/edit) the approvers for a workflow type. */
export default function ConfigureWorkflowDialog({ orgHandler, definition, existingConfig, onClose, onSaved, onError }: ConfigureWorkflowDialogProps): JSX.Element {
  const { data: roles = [], isLoading: loadingRoles } = useRoles(orgHandler);
  const { data: users = [], isLoading: loadingUsers } = useUsers(orgHandler);
  const create = useCreateWorkflowConfig();
  const update = useUpdateWorkflowConfig();

  const selectableRoles = roles.filter((r) => r.roleName !== ADMIN_ROLE);
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  // Seed edit-mode selections once the roles/users queries resolve (they are
  // empty on first render). A ref guards against re-seeding on refetch, which
  // would clobber the user's edits.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || loadingRoles || loadingUsers) return;
    if (existingConfig) {
      setSelectedRoles(roles.filter((r) => r.roleName !== ADMIN_ROLE && (existingConfig.assigneeRoles ?? []).includes(r.roleName)));
      setSelectedUsers(users.filter((u) => (existingConfig.assignees ?? []).includes(u.userId)));
    }
    seededRef.current = true;
  }, [roles, users, existingConfig, loadingRoles, loadingUsers]);

  const saving = create.isPending || update.isPending;

  const handleSave = () => {
    const input = {
      workflowDefinitionId: definition.id,
      enabled: true,
      assigneeRoles: [ADMIN_ROLE, ...selectedRoles.map((r) => r.roleName)],
      assignees: selectedUsers.map((u) => u.userId),
      formatRequestData: existingConfig?.formatRequestData ?? true,
      ...(existingConfig?.externalWorkflowEngineEndpoint ? { externalWorkflowEngineEndpoint: existingConfig.externalWorkflowEngineEndpoint } : {}),
    };
    const handlers = {
      onSuccess: () => {
        onClose();
        onSaved(definition.name);
      },
      onError: (e: Error) => {
        onClose();
        onError(e.message || 'Failed to save the workflow configuration.');
      },
    };
    if (existingConfig) update.mutate({ configId: existingConfig.id, input }, handlers);
    else create.mutate(input, handlers);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure &lsquo;{definition.name}&rsquo;</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>Choose who can approve {definition.name.toLowerCase()} requests. Administrators can always approve.</DialogContentText>
        {loadingRoles || loadingUsers ? (
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Loading roles and users…
            </Typography>
          </Stack>
        ) : (
          <Stack gap={2}>
            <Stack gap={1}>
              <Typography variant="subtitle2">Approver roles</Typography>
              <Stack direction="row" alignItems="center" gap={1}>
                <Chip label={ADMIN_ROLE} size="small" />
                <Typography variant="caption" color="text.secondary">
                  always included
                </Typography>
              </Stack>
              <Autocomplete
                multiple
                options={selectableRoles}
                value={selectedRoles}
                onChange={(_, v) => setSelectedRoles(v)}
                getOptionLabel={(r) => r.roleName}
                isOptionEqualToValue={(a, b) => a.roleId === b.roleId}
                renderInput={(params) => <TextField {...params} placeholder="Add roles" />}
              />
            </Stack>
            <Stack gap={1}>
              <Typography variant="subtitle2">Approver users (optional)</Typography>
              <Autocomplete
                multiple
                options={users}
                value={selectedUsers}
                onChange={(_, v) => setSelectedUsers(v)}
                getOptionLabel={(u) => u.displayName || u.username}
                isOptionEqualToValue={(a, b) => a.userId === b.userId}
                renderInput={(params) => <TextField {...params} placeholder="Add users" />}
              />
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || loadingRoles || loadingUsers} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
