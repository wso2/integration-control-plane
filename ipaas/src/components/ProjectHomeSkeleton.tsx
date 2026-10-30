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

import { ListingTable, PageContent, Skeleton, Stack } from '@wso2/oxygen-ui';
import { CARD_TABLE_SX } from '../constants/styles';
import type { JSX } from 'react';

/** Placeholder rows — enough to read as a list without implying a count. */
const ROW_COUNT = 4;

/**
 * The project home's shape while the project loads: the avatar/name/description header
 * and the integrations table, headings included. The columns are static labels, so they
 * can be shown before the data arrives and the table does not shift when it does.
 */
export default function ProjectHomeSkeleton(): JSX.Element {
  return (
    <PageContent fullWidth>
      <Stack component="header" direction="row" alignItems="flex-start" gap={2} sx={{ mb: 4 }} aria-busy="true" aria-label="Loading project">
        <Skeleton variant="rounded" width={58} height={58} />
        <Stack gap={1} sx={{ flex: 1, maxWidth: 420 }}>
          <Skeleton variant="text" width="45%" height={34} />
          <Skeleton variant="text" width="70%" />
        </Stack>
      </Stack>

      <ListingTable.Container disablePaper>
        <ListingTable variant="card" density="compact" sx={CARD_TABLE_SX}>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Name</ListingTable.Cell>
              <ListingTable.Cell>Description</ListingTable.Cell>
              <ListingTable.Cell sx={{ minWidth: 180, whiteSpace: 'nowrap' }}>Type</ListingTable.Cell>
              <ListingTable.Cell>Last Updated</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {Array.from({ length: ROW_COUNT }, (_, i) => (
              <ListingTable.Row key={i} variant="card">
                <ListingTable.Cell>
                  <Skeleton variant="text" width="60%" />
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <Skeleton variant="text" width="80%" />
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <Skeleton variant="text" width={120} />
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <Skeleton variant="text" width={90} />
                </ListingTable.Cell>
              </ListingTable.Row>
            ))}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>
    </PageContent>
  );
}
