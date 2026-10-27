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

import { Alert, Box, Button, Chip, CircularProgress, ListingTable, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useRoles } from '../../../hooks/useAuth';
import { useContextGrants, useDeleteContextGrant, usePutContextGrant } from '../../../hooks/useContextEngine';
import { CONTEXT_QUERY_ACTIONS } from '../../../constants/contextEngine';
import { grantAllowsQuery, roleGrantId } from '../../../utils/contextEngine';
import { HttpError } from '../../../types/http';
import { mutedSx } from '../styles';
import type { ContextEngineDetail } from '../../../types/contextEngine';

interface AccessTabProps {
  engine: ContextEngineDetail;
  orgHandle: string;
}

const centeredSx = { display: 'flex', justifyContent: 'center', py: 6 } as const;
const tableSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', mb: 3 } as const;

/** Access — grant or revoke query access per org role, and see any other grants on the engine. */
export default function AccessTab({ engine, orgHandle }: AccessTabProps): JSX.Element {
  const roles = useRoles(orgHandle);
  const grants = useContextGrants(engine.id);
  const put = usePutContextGrant(engine.id);
  const del = useDeleteContextGrant(engine.id);
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grantByRole = new Map((grants.data ?? []).filter((g) => g.group).map((g) => [g.group as string, g]));
  const otherGrants = (grants.data ?? []).filter((g) => !g.group || !g.id.startsWith('role-'));

  const toggle = (roleId: string, next: boolean) => {
    setError(null);
    setBusyRole(roleId);
    const done = {
      onSettled: () => setBusyRole(null),
      onError: (e: unknown) =>
        setError(
          e instanceof HttpError && e.status === 403
            ? "You don't have access.manage on this engine."
            : e instanceof HttpError && (e.status === 404 || e.status === 405)
              ? 'Grant management is not available on this engine yet.'
              : "Couldn't update access. Please try again.",
        ),
    };
    if (next) put.mutate({ grantId: roleGrantId(roleId), group: roleId, actions: [...CONTEXT_QUERY_ACTIONS] }, done);
    else {
      const existing = grantByRole.get(roleId);
      if (existing) del.mutate(existing.id, done);
      else setBusyRole(null);
    }
  };

  if (roles.isLoading || grants.isLoading) {
    return (
      <Box sx={centeredSx}>
        <CircularProgress />
      </Box>
    );
  }

  if (grants.isError) {
    const e = grants.error;
    const forbidden = e instanceof HttpError && (e.status === 403 || e.status === 404);
    return (
      <Alert
        severity={forbidden ? 'info' : 'error'}
        action={
          forbidden ? undefined : (
            <Button color="inherit" size="small" onClick={() => grants.refetch()}>
              Retry
            </Button>
          )
        }>
        {forbidden ? 'Only principals with access.manage on this engine can view or change its grants.' : e instanceof HttpError && e.status === 405 ? 'Grant management is not available on this engine yet.' : 'Failed to load grants.'}
      </Alert>
    );
  }

  if (roles.isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => roles.refetch()}>
            Retry
          </Button>
        }>
        Failed to load organization roles.
      </Alert>
    );
  }

  const orgRoles = roles.data ?? [];

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Typography variant="body2" sx={{ ...mutedSx, mb: 2 }}>
        Members of a granted role can ask questions, open evidence and view traces. Revoking closes access immediately, including for answers already returned.
      </Typography>

      {error && (
        <Alert severity="error" variant="outlined" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {orgRoles.length === 0 ? (
        <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
          This organization has no roles yet.
        </Alert>
      ) : (
        <ListingTable.Container elevation={0} sx={tableSx}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Role</ListingTable.Cell>
                <ListingTable.Cell>Description</ListingTable.Cell>
                <ListingTable.Cell>Actions</ListingTable.Cell>
                <ListingTable.Cell align="right">Can query</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {orgRoles.map((r) => {
                const grant = grantByRole.get(r.roleId);
                const granted = !!grant && grantAllowsQuery(grant);
                const busy = busyRole === r.roleId;
                return (
                  <ListingTable.Row key={r.roleId} hover>
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
                    <ListingTable.Cell>
                      <Stack direction="row" gap={0.5} flexWrap="wrap">
                        {(grant?.actions ?? []).map((a) => (
                          <Chip key={a} size="small" variant="outlined" label={a} />
                        ))}
                      </Stack>
                    </ListingTable.Cell>
                    <ListingTable.Cell align="right">
                      {busy ? <CircularProgress size={18} /> : <Switch size="small" checked={granted} onChange={(_e, checked) => toggle(r.roleId, checked)} inputProps={{ 'aria-label': `${granted ? 'Revoke' : 'Grant'} query access for ${r.roleName}` }} />}
                    </ListingTable.Cell>
                  </ListingTable.Row>
                );
              })}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {otherGrants.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Other grants
          </Typography>
          <ListingTable.Container elevation={0} sx={tableSx}>
            <ListingTable size="small">
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Grant</ListingTable.Cell>
                  <ListingTable.Cell>Subject</ListingTable.Cell>
                  <ListingTable.Cell>Actions</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {otherGrants.map((g) => (
                  <ListingTable.Row key={g.id}>
                    <ListingTable.Cell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {g.id}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary">
                        {g.principalId ? `Principal ${g.principalId}` : `Group ${g.group}`}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Stack direction="row" gap={0.5} flexWrap="wrap">
                        {g.actions.map((a) => (
                          <Chip key={a} size="small" variant="outlined" label={a} />
                        ))}
                      </Stack>
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ))}
              </ListingTable.Body>
            </ListingTable>
          </ListingTable.Container>
        </>
      )}
    </Box>
  );
}
