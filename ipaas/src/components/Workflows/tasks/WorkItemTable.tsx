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

import { Box, Checkbox, ListingTable, Skeleton, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ClipboardCheck, ShieldCheck } from '@wso2/oxygen-ui-icons-react';
import type { JSX, KeyboardEvent, ReactNode } from 'react';
import { formatDateTime } from '../../../utils/time';
import { IdText } from '../shared/DetailSections';
import StatusChip from '../shared/StatusChip';
import { stepStatusChipColor, stepStatusLabel, stepStatusRowStatus } from '../shared/workflowStepStatus';
import { isBulkSelectable, type WorkItem } from './workItem';
import * as styles from './WorkItemTable.styles';

const COLUMNS = ['Task', 'Type', 'Workflow ID', 'Task ID', 'Status', 'Started'];
const SKELETON_ROWS = [0, 1, 2, 3, 4];

interface WorkItemTableProps {
  items: WorkItem[];
  loading: boolean;
  emptyMessage: ReactNode;
  onOpen: (item: WorkItem) => void;
  /** Selection is offered only in bulk mode, and only for items that can be bulk-decided. */
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (taskId: string) => void;
  /** Selects every selectable row on screen, or clears them all when all are selected. */
  onToggleAll?: () => void;
}

/** What a row shows under its title: what kind of decision a review asks for. */
function triggerCaption(item: WorkItem): string | null {
  if (item.kind !== 'review' || !item.trigger) return null;
  return item.trigger === 'PRE_RUN' ? 'Approval before running' : 'Decision after failure';
}

function SelectCell({ item, selected, onToggle }: { item: WorkItem; selected: boolean; onToggle?: (taskId: string) => void }): JSX.Element {
  return (
    <ListingTable.Cell padding="checkbox" onClick={(event) => event.stopPropagation()}>
      {isBulkSelectable(item) ? (
        <Checkbox size="small" checked={selected} onChange={() => onToggle?.(item.taskId)} slotProps={{ input: { 'aria-label': `Select ${item.title}` } }} />
      ) : (
        // Every row keeps its checkbox, so the reason a row cannot be chosen is one hover away.
        <Tooltip title={item.kind === 'task' ? 'Human tasks are completed one at a time, through their own form.' : 'Only pending reviews can be decided in bulk.'} placement="top">
          <span>
            <Checkbox size="small" disabled slotProps={{ input: { 'aria-label': `Select ${item.title}` } }} />
          </span>
        </Tooltip>
      )}
    </ListingTable.Cell>
  );
}

/** The Human Tasks queue: tasks and reviews in one table, each opening its own detail. */
export default function WorkItemTable({ items, loading, emptyMessage, onOpen, selectable = false, selectedIds = [], onToggleSelect, onToggleAll }: WorkItemTableProps): JSX.Element {
  const columnCount = COLUMNS.length + (selectable ? 1 : 0);
  const selectableCount = items.filter(isBulkSelectable).length;
  const selectedCount = items.filter((item) => isBulkSelectable(item) && selectedIds.includes(item.taskId)).length;
  const allSelected = selectableCount > 0 && selectedCount === selectableCount;

  // Only the row's own focus: a key pressed on a checkbox or a copy button inside it is theirs.
  const openOnKey = (event: KeyboardEvent, item: WorkItem) => {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onOpen(item);
    }
  };

  let body: ReactNode;
  if (loading) {
    body = SKELETON_ROWS.map((row) => (
      <ListingTable.Row key={row}>
        {selectable && <ListingTable.Cell padding="checkbox" />}
        {COLUMNS.map((column) => (
          <ListingTable.Cell key={column}>
            <Skeleton variant="text" width={column === 'Status' ? 72 : '70%'} />
          </ListingTable.Cell>
        ))}
      </ListingTable.Row>
    ));
  } else if (items.length === 0) {
    body = (
      <ListingTable.Row>
        <ListingTable.Cell colSpan={columnCount} align="center" sx={styles.empty}>
          <Typography variant="body2" color="text.secondary">
            {emptyMessage}
          </Typography>
        </ListingTable.Cell>
      </ListingTable.Row>
    );
  } else {
    body = items.map((item) => {
      const caption = triggerCaption(item);
      return (
        <ListingTable.Row key={`${item.kind}-${item.taskId}`} hover clickable tabIndex={0} sx={styles.row(stepStatusRowStatus(item.status) === 'error')} onClick={() => onOpen(item)} onKeyDown={(event) => openOnKey(event, item)}>
          {selectable && <SelectCell item={item} selected={selectedIds.includes(item.taskId)} onToggle={onToggleSelect} />}
          <ListingTable.Cell>
            <Box sx={styles.titleCell}>
              <Box component="span" sx={styles.kindIcon}>
                {item.kind === 'task' ? <ClipboardCheck size={16} /> : <ShieldCheck size={16} />}
              </Box>
              <Box sx={styles.titleText}>
                <Typography variant="body2" noWrap>
                  {item.title}
                </Typography>
                {caption && (
                  <Typography variant="caption" sx={styles.caption}>
                    {caption}
                  </Typography>
                )}
              </Box>
            </Box>
          </ListingTable.Cell>
          <ListingTable.Cell>{item.kind === 'task' ? 'Task' : 'Review'}</ListingTable.Cell>
          <ListingTable.Cell>
            <IdText id={item.parentWorkflowId} />
          </ListingTable.Cell>
          <ListingTable.Cell>
            <IdText id={item.taskId} />
          </ListingTable.Cell>
          <ListingTable.Cell>
            <StatusChip label={stepStatusLabel(item.status)} color={stepStatusChipColor(item.status)} />
          </ListingTable.Cell>
          <ListingTable.Cell sx={styles.nowrap}>{formatDateTime(item.startTime)}</ListingTable.Cell>
        </ListingTable.Row>
      );
    });
  }

  return (
    <ListingTable.Container elevation={0} sx={styles.container}>
      <ListingTable size="small">
        <ListingTable.Head>
          <ListingTable.Row>
            {selectable && (
              <ListingTable.Cell padding="checkbox">
                <Checkbox size="small" checked={allSelected} indeterminate={!allSelected && selectedCount > 0} disabled={selectableCount === 0} onChange={() => onToggleAll?.()} slotProps={{ input: { 'aria-label': 'Select every pending review' } }} />
              </ListingTable.Cell>
            )}
            {COLUMNS.map((column) => (
              <ListingTable.Cell key={column}>{column}</ListingTable.Cell>
            ))}
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>{body}</ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}
