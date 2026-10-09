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

import { Chip, ListingTable, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

const enforcementChips = [
  { key: 'On Error', color: 'error' as const },
  { key: 'On Warning', color: 'warning' as const },
  { key: 'On Info', color: 'info' as const },
];

/**
 * Decorative, frozen enforcement-details table shared by the ruleset and AI
 * policy editors. One hardcoded row (State: Update, all actions "Notify").
 * Purely presentational — nothing here is ever submitted to the backend.
 */
export default function EnforcementDetailsTable(): JSX.Element {
  return (
    <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <ListingTable size="small">
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>State</ListingTable.Cell>
            <ListingTable.Cell>On Error</ListingTable.Cell>
            <ListingTable.Cell>On Warning</ListingTable.Cell>
            <ListingTable.Cell>On Info</ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          <ListingTable.Row>
            <ListingTable.Cell>
              <Typography variant="body2">Update</Typography>
            </ListingTable.Cell>
            {enforcementChips.map((c) => (
              <ListingTable.Cell key={c.key}>
                <Chip label="Notify" size="small" variant="outlined" color={c.color} />
              </ListingTable.Cell>
            ))}
          </ListingTable.Row>
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}
