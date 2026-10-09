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

import { Alert, Box, Button, CircularProgress, ListingTable, Stack, Typography } from '@wso2/oxygen-ui';
import { Archive } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useServerBackups } from '../../../hooks/usePlatformServices';
import { formatBytes, formatServerDateTime } from '../../../utils/platformServices';

export default function BackupsTab({ serverId }: { serverId: string }): JSX.Element {
  const { data, isLoading, isError, refetch } = useServerBackups(serverId);
  const backups = data?.backups ?? [];

  if (isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Failed to load backups.
      </Alert>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
        <Alert severity="info" sx={{ flex: 1 }}>
          WSO2 Integration Platform maintains automatic backups to ensure data security. These backups are useful to restore data in case of a critical system failure.
        </Alert>
      </Stack>

      {backups.length === 0 ? (
        <Alert severity="info">No backups are available yet.</Alert>
      ) : (
        <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Backup</ListingTable.Cell>
                <ListingTable.Cell>Created</ListingTable.Cell>
                <ListingTable.Cell align="right">Size</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {backups.map((b) => (
                <ListingTable.Row key={b.backup_name}>
                  <ListingTable.Cell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Archive size={18} />
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {b.backup_name}
                      </Typography>
                    </Box>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Typography variant="body2" color="text.secondary">
                      {formatServerDateTime(b.backup_time)}
                    </Typography>
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Typography variant="body2">{formatBytes(b.data_size)}</Typography>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}
    </Box>
  );
}
