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

import { Chip, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Pencil, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { volumeTypeLabel } from '../../utils/storage';
import type { VolumeRow } from '../../../types/storage';

interface VolumeListProps {
  rows: VolumeRow[];
  canManage: boolean;
  containerName: (containerId: string) => string;
  onEdit: (row: VolumeRow) => void;
  onDelete: (row: VolumeRow) => void;
}

export default function VolumeList({ rows, canManage, containerName, onEdit, onDelete }: VolumeListProps): JSX.Element {
  return (
    <ListingTable.Container>
      <ListingTable>
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>Volume Name</ListingTable.Cell>
            <ListingTable.Cell>Volume Details</ListingTable.Cell>
            <ListingTable.Cell>Container</ListingTable.Cell>
            <ListingTable.Cell>Mounts</ListingTable.Cell>
            {canManage && <ListingTable.Cell align="right">Actions</ListingTable.Cell>}
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {rows.map(({ volume, mounts }) => (
            <ListingTable.Row key={volume.ID}>
              <ListingTable.Cell>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {volume.name}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Chip label={volumeTypeLabel(volume)} size="small" variant="outlined" />
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2" color="text.secondary">
                  {mounts.length ? containerName(mounts[0].container_id) : 'Not mounted'}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                {mounts.length ? (
                  <Stack direction="row" gap={0.5} flexWrap="wrap">
                    {mounts.map((m) => (
                      <Chip key={m.ID} label={m.MountPath} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    —
                  </Typography>
                )}
              </ListingTable.Cell>
              {canManage && (
                <ListingTable.Cell align="right">
                  <Tooltip title="Edit">
                    <IconButton size="small" aria-label={`Edit ${volume.name}`} onClick={() => onEdit({ volume, mounts })}>
                      <Pencil size={16} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" aria-label={`Delete ${volume.name}`} onClick={() => onDelete({ volume, mounts })}>
                      <Trash2 size={16} />
                    </IconButton>
                  </Tooltip>
                </ListingTable.Cell>
              )}
            </ListingTable.Row>
          ))}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}
