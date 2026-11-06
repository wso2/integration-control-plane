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

import { Chip, ListingTable, Stack, Typography } from '@wso2/oxygen-ui';
import { useAuth } from '../../auth';
import type { WorkItem } from '../../hooks/useTasks';
import type { ReviewDecisionRecord } from '../../types/workflow';
import i18n, { useTranslation } from '../../i18n';
import { formatDateTime, formatRelative, humanize } from '../../utils/time';
import { rowOpenProps } from '../detail';
import IntegrationIcon from '../IntegrationIcon';

export function workItemType(item: WorkItem): string {
  if (item.kind === 'task') return i18n.t('workflow.workItemType.task');
  return item.trigger === 'ON_FAILURE' ? i18n.t('workflow.workItemType.reviewAfterFailure') : i18n.t('workflow.workItemType.review');
}

export function WorkItemTypeChip({ item }: { item: WorkItem }) {
  return <Chip size="small" variant="outlined" color={item.kind === 'task' ? 'info' : 'warning'} label={workItemType(item)} />;
}

type ChipColor = 'success' | 'error' | 'warning' | 'default';

type OutcomeSource = Pick<WorkItem, 'kind' | 'status' | 'completedBy' | 'trigger'>;

export function outcomeOf(item: OutcomeSource, decision?: ReviewDecisionRecord | null): { label: string; color: ChipColor } {
  switch (item.status) {
    case 'FAILED':
      return item.completedBy ? { label: i18n.t('workflow.outcome.rejected'), color: 'error' } : { label: i18n.t('workflow.outcome.timedOut'), color: 'warning' };
    case 'CANCELED':
      return { label: i18n.t('workflow.outcome.canceled'), color: 'default' };
    case 'TERMINATED':
      return { label: i18n.t('workflow.outcome.terminated'), color: 'default' };
  }
  if (item.kind === 'task') return { label: i18n.t('workflow.outcome.completed'), color: 'success' };
  // A review's list row only says it was decided; its detail has the decision.
  const retry = item.trigger === 'ON_FAILURE';
  switch (decision?.action) {
    case 'proceed':
      return { label: retry ? i18n.t('workflow.outcome.retried') : i18n.t('workflow.outcome.approved'), color: 'success' };
    case 'proceed-with-input':
      return { label: retry ? i18n.t('workflow.outcome.retriedWithChanges') : i18n.t('workflow.outcome.approvedWithChanges'), color: 'success' };
    case 'reject':
      return { label: i18n.t('workflow.outcome.rejected'), color: 'error' };
    default:
      return { label: i18n.t('workflow.outcome.decided'), color: 'default' };
  }
}

export function OutcomeChip({ item, decision }: { item: OutcomeSource; decision?: ReviewDecisionRecord | null }) {
  const { label, color } = outcomeOf(item, decision);
  return <Chip size="small" variant="outlined" color={color} label={label} />;
}

export function useCompleterName(): (completedBy: string) => string {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (completedBy) => (user.id && completedBy === user.id ? t('common.you') : completedBy);
}

/** Tasks and approvals, as ICP's work queue lists them. */
export default function WorkItemsTable({ items, onOpen, showIntegration, completed }: { items: WorkItem[]; onOpen: (item: WorkItem) => void; showIntegration?: boolean; completed?: boolean }) {
  const { t } = useTranslation();
  const completerName = useCompleterName();
  return (
    <ListingTable.Container disablePaper>
      <ListingTable variant="card" density="compact" sx={{ '& .MuiTableBody-root .MuiTableCell-root': { py: 1.5 } }}>
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>{t('workflow.columns.title')}</ListingTable.Cell>
            <ListingTable.Cell>{t('workflow.columns.type')}</ListingTable.Cell>
            {showIntegration && <ListingTable.Cell>{t('workflow.columns.workflow')}</ListingTable.Cell>}
            {completed && <ListingTable.Cell>{t('workflow.columns.outcome')}</ListingTable.Cell>}
            <ListingTable.Cell>{completed ? t('workflow.columns.completed') : t('workflow.columns.waitingSince')}</ListingTable.Cell>
            {completed && <ListingTable.Cell>{t('workflow.columns.by')}</ListingTable.Cell>}
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {items.map((item) => (
            <ListingTable.Row key={`${item.endpointUrl}:${item.kind}:${item.id}`} variant="card" {...rowOpenProps(() => onOpen(item))} aria-label={t('workflow.workItems.openItem', { title: item.title })}>
              <ListingTable.Cell>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {item.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {humanize(item.name)}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <WorkItemTypeChip item={item} />
              </ListingTable.Cell>
              {showIntegration && (
                <ListingTable.Cell>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <IntegrationIcon kind="workflow" size={24} />
                    <Typography variant="body2" noWrap>
                      {item.integration.displayName}
                    </Typography>
                  </Stack>
                </ListingTable.Cell>
              )}
              {completed && (
                <ListingTable.Cell>
                  <OutcomeChip item={item} />
                </ListingTable.Cell>
              )}
              <ListingTable.Cell>
                <Typography variant="body2" color="text.secondary" title={formatDateTime(completed ? item.closeTime : item.startTime)} noWrap>
                  {formatRelative(completed ? item.closeTime : item.startTime)}
                </Typography>
              </ListingTable.Cell>
              {completed && (
                <ListingTable.Cell>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {item.completedBy ? completerName(item.completedBy) : t('common.noValue')}
                  </Typography>
                </ListingTable.Cell>
              )}
            </ListingTable.Row>
          ))}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}
