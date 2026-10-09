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

import { Button, Chip, ListingTable, Typography } from '@wso2/oxygen-ui';
import { type JSX } from 'react';
import { workflowStatusChip } from '../../constants/workflows';
import { formatDateTime } from '../../../utils/time';
import type { WorkflowInstanceResponse } from '../../../types/workflow';

export type ApprovalsTab = 'pending' | 'past';

interface ApprovalsTableProps {
  instances: WorkflowInstanceResponse[];
  tab: ApprovalsTab;
  onSelect: (instance: WorkflowInstanceResponse) => void;
}

export default function ApprovalsTable({ instances, tab, onSelect }: ApprovalsTableProps): JSX.Element {
  return (
    <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflowX: 'auto' }}>
      <ListingTable size="small">
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>Type</ListingTable.Cell>
            <ListingTable.Cell>Requested by</ListingTable.Cell>
            <ListingTable.Cell>Requested at</ListingTable.Cell>
            <ListingTable.Cell>Status</ListingTable.Cell>
            <ListingTable.Cell align="right">Actions</ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {instances.map((i) => {
            const chip = workflowStatusChip(i.status);
            return (
              <ListingTable.Row key={i.wkfId} hover>
                <ListingTable.Cell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {i.workflowDefinitionIdentifier}
                  </Typography>
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <Typography variant="body2" color="text.secondary">
                    {i.createdUser?.displayName || i.createdUser?.email || '—'}
                  </Typography>
                </ListingTable.Cell>
                <ListingTable.Cell>{formatDateTime(i.createdTime)}</ListingTable.Cell>
                <ListingTable.Cell>
                  <Chip size="small" variant="outlined" color={chip.color} label={chip.label} />
                </ListingTable.Cell>
                <ListingTable.Cell align="right">
                  <Button size="small" variant="text" onClick={() => onSelect(i)}>
                    {tab === 'pending' ? 'Review' : 'View'}
                  </Button>
                </ListingTable.Cell>
              </ListingTable.Row>
            );
          })}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}
