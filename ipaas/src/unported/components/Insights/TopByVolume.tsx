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

import { Alert, Box, Chip, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { ColorDot, InsightsCard, TableSkeletonRows } from './shared';
import { INSIGHTS_KIND_LABEL } from '../../../constants/insights';
import { truncate } from '../../../utils/string';
import type { ProjectVolumeRow } from '../../../types/insights';

/** "Top integrations by volume" — every integration as a table row (Name / Type /
 * Volume). Volume cell shows the count then a fixed-width proportion bar (so full
 * bar always means 100%). Rows with a handler navigate via onRowClick. */
export function TopByVolume({ rows, loading = false, onRowClick }: { rows: ProjectVolumeRow[]; loading?: boolean; onRowClick?: (handler: string) => void }): JSX.Element {
  return (
    <InsightsCard fill={false} title="Active integrations by volume" subtitle="Share of total invocations">
      {!loading && rows.length === 0 ? (
        <Alert severity="info">No integrations to display.</Alert>
      ) : (
        <ListingTable.Container disablePaper sx={{ maxHeight: 'none', height: 'auto' }}>
          <ListingTable density="standard" variant="card">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell sx={{ width: '22%' }}>Name</ListingTable.Cell>
                <ListingTable.Cell>Type</ListingTable.Cell>
                <ListingTable.Cell>Volume</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {loading ? (
                <TableSkeletonRows cols={3} />
              ) : (
                rows.map((r) => {
                  const clickable = !!(r.handler && onRowClick);
                  return (
                    <ListingTable.Row key={r.id} variant="card" hover={clickable} clickable={clickable} onClick={clickable ? () => onRowClick!(r.handler) : undefined}>
                      <ListingTable.Cell sx={{ width: '22%' }}>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <ColorDot color={r.color} size={8} />
                          <Tooltip title={r.name}>
                            <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: 'nowrap', minWidth: 0 }}>
                              {truncate(r.name, 25)}
                            </Typography>
                          </Tooltip>
                        </Stack>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Chip size="small" variant="outlined" label={INSIGHTS_KIND_LABEL[r.type]} />
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Stack direction="row" alignItems="center" gap={1.5}>
                          <Typography variant="body2" sx={{ minWidth: 100, whiteSpace: 'nowrap' }}>
                            {r.volume}{' '}
                            <Typography component="span" variant="caption" color="text.secondary">
                              {r.unit}
                            </Typography>
                          </Typography>
                          <Box sx={{ flex: 1, minWidth: 120, height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
                            <Box sx={{ height: '100%', width: `${r.share}%`, bgcolor: r.color, borderRadius: 3 }} />
                          </Box>
                        </Stack>
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  );
                })
              )}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}
    </InsightsCard>
  );
}
