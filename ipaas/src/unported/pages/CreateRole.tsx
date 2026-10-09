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

import { Alert, Box, Button, Checkbox, FormControlLabel, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft, ChevronDown, ChevronUp } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useCreateRole, useAllPermissions } from '../../hooks/useAuth';
import type { Permission } from '../../types/auth';
import { orgAccessControlUrl } from '../../paths';

function PermissionsEditor({ allPermissions, selectedIds, onChange }: { allPermissions: Record<string, Permission[]>; selectedIds: Set<string>; onChange: (ids: Set<string>) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (domain: string) => setExpanded((p) => ({ ...p, [domain]: !p[domain] }));
  const toggleDomain = (_domain: string, perms: Permission[]) => {
    const allSelected = perms.every((p) => selectedIds.has(p.permissionId));
    const next = new Set(selectedIds);
    for (const p of perms) {
      if (allSelected) {
        next.delete(p.permissionId);
      } else {
        next.add(p.permissionId);
      }
    }
    onChange(next);
  };
  const togglePerm = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
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

export default function CreateRole(): JSX.Element {
  const { orgHandler = 'default' } = useParams();
  const navigate = useAppNavigate();
  const [roleName, setRoleName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { data: allPermsData } = useAllPermissions();
  const mutation = useCreateRole(orgHandler);
  const backUrl = orgAccessControlUrl(orgHandler, 'roles');

  const submit = () => {
    setError(null);
    mutation.mutate(
      { roleName: roleName.trim(), description: description.trim(), permissionIds: [...selectedIds] },
      {
        onSuccess: () => navigate(backUrl, { state: { created: true, name: roleName.trim() } }),
        onError: (err) => setError(err.message ?? 'Failed to create role. Please try again.'),
      },
    );
  };

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(backUrl)} sx={{ mb: 2 }}>
        Back to Roles
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Create Role
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3, maxWidth: 600 }}>
          {error}
        </Alert>
      )}

      <Stack gap={3} sx={{ maxWidth: 600, mb: 4 }}>
        <TextField label="Role Name" required value={roleName} onChange={(e) => setRoleName(e.target.value)} fullWidth />
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
      </Stack>

      {allPermsData && <PermissionsEditor allPermissions={allPermsData.groupedByDomain} selectedIds={selectedIds} onChange={setSelectedIds} />}

      <Stack direction="row" gap={2} sx={{ mt: 3 }}>
        <Button variant="outlined" onClick={() => navigate(backUrl)}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!roleName.trim() || mutation.isPending || mutation.isSuccess}>
          Create
        </Button>
      </Stack>
    </PageContent>
  );
}
