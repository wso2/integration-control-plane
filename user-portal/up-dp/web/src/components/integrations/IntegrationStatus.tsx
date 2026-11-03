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

import { Stack, Typography } from '@wso2/oxygen-ui';
import { Clock, ListChecks, MessageSquare, Play } from '@wso2/oxygen-ui-icons-react';
import { useTranslation } from 'react-i18next';
import { latestTrack, useDeployment, useLastExecution } from '../../hooks/useIntegrations';
import type { Integration } from '../../types/portal';
import { scheduleOf } from '../../utils/cron';
import { formatRelative } from '../../utils/time';
import { FailedIcon, InProgressIcon, SuccessIcon } from '../StatusIcons';

const lineSx = { color: 'text.secondary', minWidth: 0 } as const;

function Line({ icon, children, sx = lineSx }: { icon: React.ReactNode; children: React.ReactNode; sx?: object }) {
  return (
    <Stack direction="row" alignItems="center" gap={0.75} sx={sx}>
      {icon}
      <Typography variant="caption" noWrap>
        {children}
      </Typography>
    </Stack>
  );
}

function AutomationStatus({ integration }: { integration: Integration }) {
  const { t } = useTranslation();
  const track = latestTrack(integration);
  const { data: deployment } = useDeployment(integration.id, track?.id);
  const { data: last } = useLastExecution(integration.id, track?.id);
  const schedule = scheduleOf(deployment);

  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
      {schedule ? <Line icon={<Clock size={14} />}>{t('integrations.status.nextRun', { when: formatRelative(schedule.next.toISOString()) })}</Line> : <Line icon={<Play size={14} />}>{t('integrations.status.onDemand')}</Line>}
      {last && (
        <Line icon={last.status === 'Running' ? <InProgressIcon size={14} /> : last.status === 'Succeeded' ? <SuccessIcon size={14} /> : <FailedIcon size={14} />}>
          {last.status === 'Running' ? t('integrations.status.runningNow') : t('integrations.status.lastRun', { when: formatRelative(last.startTime) })}
        </Line>
      )}
    </Stack>
  );
}

/** One line on what an integration holds for the viewer: its runs, its waiting tasks, its chat. */
export default function IntegrationStatus({ integration, waiting }: { integration: Integration; waiting: number }) {
  const { t } = useTranslation();
  if (integration.kind === 'automation') return <AutomationStatus integration={integration} />;
  if (integration.kind === 'workflow')
    return (
      <Line icon={<ListChecks size={14} />} sx={waiting ? { color: 'warning.main', fontWeight: 600 } : lineSx}>
        {waiting ? t('integrations.status.tasksWaiting', { count: waiting }) : t('integrations.status.nothingWaiting')}
      </Line>
    );
  const endpoints = integration.deploymentTracks.reduce((count, track) => count + (track.endpoints?.length ?? 0), 0);
  return <Line icon={<MessageSquare size={14} />}>{endpoints > 1 ? t('integrations.status.chatEndpoints', { count: endpoints }) : t('integrations.status.readyToChat')}</Line>;
}
