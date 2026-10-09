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

import { Alert, Box, Button, Chip, CircularProgress, ListingTable, Stack } from '@wso2/oxygen-ui';
import { Users } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import Authorized from '../../../../components/Authorized';
import EmptyListing from '../../../../components/EmptyListing';
import { Permissions } from '../../../../constants/permissions';
import { useRoleGroupMappings } from '../../../hooks/useAppSecurity';
import type { RoleGroupMapping } from '../../../../types/appSecurity';
import MapGroupsDialog from './MapGroupsDialog';

export default function RoleManagementTab(): JSX.Element {
  const { data, isLoading, isError, refetch } = useRoleGroupMappings();
  const [mapping, setMapping] = useState<RoleGroupMapping | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  if (isError)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Failed to load role mappings.
      </Alert>
    );

  const mappings = data?.roleGroupMappings ?? [];

  return (
    <>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {mappings.length === 0 ? (
        <EmptyListing icon={<Users size={48} />} title="No roles" description="There are no roles available to map identity-provider groups to." />
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Role</ListingTable.Cell>
                <ListingTable.Cell>Groups</ListingTable.Cell>
                <ListingTable.Cell align="right">Action</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {mappings.map((m) => (
                <ListingTable.Row key={m.role.id}>
                  <ListingTable.Cell>{m.role.name}</ListingTable.Cell>
                  <ListingTable.Cell>
                    {m.groups.length > 0 ? (
                      <Stack direction="row" gap={0.5} flexWrap="wrap">
                        {m.groups.map((g) => (
                          <Chip key={g} label={g} size="small" />
                        ))}
                      </Stack>
                    ) : (
                      '—'
                    )}
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Authorized permissions={Permissions.USER_MANAGE_ROLES}>
                      <Button size="small" variant="outlined" onClick={() => setMapping(m)} sx={{ textTransform: 'none' }}>
                        Map groups
                      </Button>
                    </Authorized>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {mapping && (
        <MapGroupsDialog
          roleId={mapping.role.id}
          roleName={mapping.role.name}
          currentGroups={mapping.groups}
          onClose={() => setMapping(null)}
          onSaved={(name) => setAlert({ type: 'success', message: `Groups updated for '${name}'.` })}
          onError={(message) => setAlert({ type: 'error', message })}
        />
      )}
    </>
  );
}
