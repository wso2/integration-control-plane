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

import { IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Pencil, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { GovernancePolicyInfo } from '../../../types/governance';

interface PolicyTableProps {
  policies: GovernancePolicyInfo[];
  onEdit: (policyId: string) => void;
  onDelete: (policy: GovernancePolicyInfo) => void;
  emptyMessage?: string;
}

export default function PolicyTable({ policies, onEdit, onDelete, emptyMessage = 'No policies found.' }: PolicyTableProps): JSX.Element {
  return (
    <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <ListingTable size="small">
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>Name</ListingTable.Cell>
            <ListingTable.Cell>Description</ListingTable.Cell>
            <ListingTable.Cell align="right">Action</ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {policies.length === 0 ? (
            <ListingTable.Row>
              <ListingTable.Cell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                {emptyMessage}
              </ListingTable.Cell>
            </ListingTable.Row>
          ) : (
            policies.map((policy) => {
              const id = policy.id;
              if (!id) return null;
              return (
                <ListingTable.Row key={id} hover sx={{ cursor: 'pointer' }} onClick={() => onEdit(id)}>
                  <ListingTable.Cell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {policy.name}
                    </Typography>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Typography variant="body2" color="text.secondary">
                      {policy.description || '—'}
                    </Typography>
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Stack direction="row" gap={0.5} justifyContent="flex-end">
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(id);
                          }}>
                          <Pencil size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(policy);
                          }}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </ListingTable.Cell>
                </ListingTable.Row>
              );
            })
          )}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}
