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

import { Alert, Box, Button, Divider, Skeleton, Typography } from '@wso2/oxygen-ui';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { EnvCardBodyProps } from '../../../types/integration';
import EnvCardSkeleton from '../_shared/EnvCardSkeleton';
import AutomationExecutions from '../../AutomationExecutions';
import PillTabs from '../../PillTabs';
import KnowledgeBaseRetrieval from '../../KnowledgeBase/KnowledgeBaseRetrieval';
import { useKnowledgeBase } from '../../../hooks/useKnowledgeBases';
import { isNotFoundError } from '../../../utils/apiErrors';
import type { Component } from '../../../types/component';

/**
 * RAG Ingestion's content-only body: an Executions | Retrieval tab switcher.
 * Executions reuses the shared cronjob execution-history table; Retrieval is a
 * chat window that queries the knowledge base the ingestion feeds. Both appear
 * only once the ingestion is deployed. No Card/header chrome — the shell frames it.
 */
export default function EnvCardBody({
  component,
  env,
  projectId,
  versionId,
  releaseId,
  orgHandler,
  projectHandler,
  componentHandler,
  hasDeployment,
  loadingDeployment,
  pendingTriggerTime,
  pendingTriggerArgs,
  onTriggerResolved,
  onTrigger,
  onNotify,
}: EnvCardBodyProps): ReactNode {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);

  if (loadingDeployment) return <EnvCardSkeleton />;

  return (
    <>
      <Divider sx={{ my: 2 }} />

      {!hasDeployment ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          Deploy this ingestion to view executions and test retrieval.
        </Typography>
      ) : (
        <>
          <Box sx={{ mb: 2 }}>
            <PillTabs value={tab} onChange={setTab} tabs={[{ label: 'Executions' }, { label: 'Retrieval' }]} />
          </Box>

          {tab === 0 && (
            <AutomationExecutions
              releaseId={releaseId}
              projectId={projectId}
              componentId={component.id}
              deploymentTrackId={versionId}
              environmentId={env.id}
              orgHandler={orgHandler}
              projectHandler={projectHandler}
              componentHandler={componentHandler}
              envCritical={env.critical ?? false}
              pendingTriggerTime={pendingTriggerTime}
              pendingTriggerArgs={pendingTriggerArgs}
              onTriggerResolved={onTriggerResolved}
              onRunSuccess={() => {
                onNotify({ text: 'Execution triggered successfully', severity: 'success' });
                onTrigger(Date.now());
                queryClient.invalidateQueries({ queryKey: ['taskExecutions'] });
              }}
            />
          )}

          {tab === 1 && (
            <Box sx={{ minHeight: 320 }}>
              <IngestionRetrieval component={component} />
            </Box>
          )}
        </>
      )}
    </>
  );
}

function IngestionRetrieval({ component }: { component: Component }): ReactNode {
  if (!component.knowledgeBase) return <Alert severity="info">This ingestion does not feed a knowledge base, so there is nothing to query.</Alert>;
  return <LinkedKnowledgeBaseRetrieval knowledgeBase={component.knowledgeBase} componentId={component.id} />;
}

function LinkedKnowledgeBaseRetrieval({ knowledgeBase, componentId }: { knowledgeBase: string; componentId: string }): ReactNode {
  const { data: kb, isLoading, isError, error, refetch } = useKnowledgeBase(knowledgeBase);
  if (isLoading) return <Skeleton variant="rounded" height={320} />;
  if (isNotFoundError(error)) return <Alert severity="info">The knowledge base this ingestion feeds no longer exists, so there is nothing to query.</Alert>;
  if (isError || !kb) {
    return (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Could not load the knowledge base this ingestion feeds.
      </Alert>
    );
  }
  return <KnowledgeBaseRetrieval knowledgeBase={kb} componentId={componentId} />;
}
