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

import { Alert, Box, Button, Checkbox, CircularProgress, ListingTable, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useRoles } from '../../../hooks/useAuth';
import { stepHeadingSx, stepHintSx } from '../styles';

interface AccessStepProps {
  orgHandle: string;
  /** Selected org role handles. */
  roles: string[];
  onChange: (roles: string[]) => void;
}

const centeredSx = { display: 'flex', justifyContent: 'center', py: 6 } as const;
const tableSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', maxWidth: 760 } as const;

/** Step 2 — which org roles may query the engine. Members of these roles get read, evidence and trace actions. */
export default function AccessStep({ orgHandle, roles, onChange }: AccessStepProps): JSX.Element {
  const { data: orgRoles, isLoading, isError, refetch } = useRoles(orgHandle);
  const selected = new Set(roles);
  const all = orgRoles ?? [];
  const allSelected = all.length > 0 && all.every((r) => selected.has(r.roleId));

  const toggle = (roleId: string) => {
    const next = new Set(selected);
    if (next.has(roleId)) next.delete(roleId);
    else next.add(roleId);
    onChange(all.filter((r) => next.has(r.roleId)).map((r) => r.roleId));
  };

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Grant Access
      </Typography>
      <Typography variant="body2" sx={stepHintSx}>
        Choose the organization roles that can query this engine. Members can ask questions, open evidence and view traces; they cannot change sources or models. You keep full access as the owner.
      </Typography>

      {isLoading ? (
        <Box sx={centeredSx}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load organization roles.
        </Alert>
      ) : all.length === 0 ? (
        <Alert severity="info" variant="outlined">
          This organization has no roles yet. You can continue and grant access later from the engine's Access tab.
        </Alert>
      ) : (
        <>
          <ListingTable.Container elevation={0} sx={tableSx}>
            <ListingTable size="small">
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell padding="checkbox">
                    <Checkbox size="small" checked={allSelected} indeterminate={!allSelected && roles.length > 0} onChange={() => onChange(allSelected ? [] : all.map((r) => r.roleId))} inputProps={{ 'aria-label': 'Select all roles' }} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>Role</ListingTable.Cell>
                  <ListingTable.Cell>Description</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {all.map((r) => (
                  <ListingTable.Row key={r.roleId} hover selected={selected.has(r.roleId)} sx={{ cursor: 'pointer' }} onClick={() => toggle(r.roleId)}>
                    <ListingTable.Cell padding="checkbox">
                      <Checkbox size="small" checked={selected.has(r.roleId)} onChange={() => toggle(r.roleId)} onClick={(e) => e.stopPropagation()} inputProps={{ 'aria-label': `Grant ${r.roleName}` }} />
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {r.roleName}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary">
                        {r.description || '—'}
                      </Typography>
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ))}
              </ListingTable.Body>
            </ListingTable>
          </ListingTable.Container>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            {roles.length === 0 ? 'No roles selected — only you will be able to query this engine.' : `${roles.length} of ${all.length} roles can query this engine.`}
          </Typography>
        </>
      )}
    </>
  );
}
