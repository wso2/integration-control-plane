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

import { Alert, Box, Chip, CircularProgress, ListingTable, Stack, Tooltip, Typography, RelativeTime } from '@wso2/oxygen-ui';
import { HelpCircle } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import * as styles from './PodEventsTable.styles';
import { POD_EVENT_COUNT_TOOLTIP } from '../../constants/runtime';
import { humanizePodStatus } from '../../utils/pods';
import { formatDateTime, formatDistanceToNow } from '../../utils/time';
import type { PodEvent } from '../../types/runtime';

interface PodEventsTableProps {
  events: PodEvent[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

export default function PodEventsTable({ events, isLoading, isError }: PodEventsTableProps): JSX.Element {
  if (isLoading) {
    return (
      <Box sx={styles.loading}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return <Alert severity="error">Failed to collect events. Please try again.</Alert>;
  }

  if (!events?.length) {
    return (
      <Box sx={styles.emptyState}>
        <Typography variant="h5" gutterBottom>
          No pod events available at this time.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Events are only published during container creation, restarts, and termination to assist in diagnosing issues. These records are only kept up to an hour.
        </Typography>
      </Box>
    );
  }

  return (
    <ListingTable.Container elevation={0} sx={styles.container}>
      <ListingTable size="small">
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>Event</ListingTable.Cell>
            <ListingTable.Cell>Event message</ListingTable.Cell>
            <ListingTable.Cell>
              <Stack direction="row" alignItems="center" gap={0.5}>
                Count
                <Tooltip title={POD_EVENT_COUNT_TOOLTIP}>
                  <Box component="span" tabIndex={0} role="note" aria-label={POD_EVENT_COUNT_TOOLTIP} sx={styles.helpIcon}>
                    <HelpCircle size={13} />
                  </Box>
                </Tooltip>
              </Stack>
            </ListingTable.Cell>
            <ListingTable.Cell align="right">Time</ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {events.map((event) => (
            <ListingTable.Row key={event.id}>
              <ListingTable.Cell>
                <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                  {event.kind && <Chip size="small" variant="outlined" label={event.kind} />}
                  <Typography variant="body2">{humanizePodStatus(event.reason)}</Typography>
                </Stack>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2" sx={styles.message}>
                  {event.message}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>{event.count ?? '-'}</ListingTable.Cell>
              <ListingTable.Cell align="right" sx={styles.time}>
                {event.timestamp ? <RelativeTime time={formatDistanceToNow(event.timestamp)} dateTime={event.timestamp} tooltip={formatDateTime(event.timestamp)} /> : '—'}
              </ListingTable.Cell>
            </ListingTable.Row>
          ))}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}
