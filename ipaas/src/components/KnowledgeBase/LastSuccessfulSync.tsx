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

import { CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useTaskExecutions } from '../../hooks/useExecutions';
import { executionPhase } from '../../utils/executionStatus';
import { formatDateTime } from '../../utils/time';
import type { KnowledgeBase, KnowledgeBaseDataSource } from '../../types/knowledgeBase';

// While a run is in flight the history is polled, so the cell flips once it lands.
const POLL_MS = 15_000;

/** When the data source last ingested successfully, or that a run is in progress. */
export default function LastSuccessfulSync({ kb, dataSource }: { kb: KnowledgeBase; dataSource: KnowledgeBaseDataSource }): JSX.Element {
  const {
    data: executions,
    isLoading,
    isError,
  } = useTaskExecutions(dataSource.releaseName, dataSource.name, kb.environment, kb.projectName, (query) => ((query.state.data ?? []).some((e) => executionPhase(e.status) === 'inProgress' || executionPhase(e.status) === 'queued') ? POLL_MS : false));
  if (isLoading) return <CircularProgress size={14} />;
  if (isError) {
    return (
      <Typography variant="body2" color="text.secondary">
        Unavailable
      </Typography>
    );
  }
  const running = (executions ?? []).some((e) => executionPhase(e.status) === 'inProgress');
  // History is newest-first.
  const last = (executions ?? []).find((e) => executionPhase(e.status) === 'succeeded');
  // A one-time source whose first run did not start says so until it has any run.
  const firstRunMissed = !!dataSource.firstRunError && (executions ?? []).length === 0;
  return (
    <Stack>
      <Typography variant="body2">{last ? formatDateTime(last.completionTime || last.startTime) : '—'}</Typography>
      {firstRunMissed && (
        <Typography variant="caption" color="warning.main">
          {dataSource.firstRunError}
        </Typography>
      )}
      {running && (
        <Typography variant="caption" color="text.secondary">
          Ingesting…
        </Typography>
      )}
    </Stack>
  );
}
