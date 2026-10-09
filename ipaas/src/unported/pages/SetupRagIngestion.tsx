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

import { Alert, Box, Button, CircularProgress, LinearProgress, PageContent, PageTitle, Stack, Typography } from '@wso2/oxygen-ui';
import { useEffect, useReducer, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { isRagIngestionEnabled, useCreateRagIngestion } from '../../hooks/useRagIngestion';
import { useProjects } from '../../hooks/useProjects';
import { useSubscriptions } from '../../hooks/useSubscription';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { PAID_SUBSCRIPTION_TYPE } from '../../constants/subscription';
import { isChunkingValid, isDatasourceValid, isEmbeddingValid, isVectorStoreValid, isAutomationValid } from '../../utils/ragIngestion';
import { initialRagForm, ragFormReducer } from '../components/RagIngestion/formReducer';
import { componentOverviewUrl } from '../../paths';
import ComingSoon from '../../pages/ComingSoon';
import RagUpgradeRequired from '../components/RagIngestion/RagUpgradeRequired';
import VerticalStepper from '../../components/VerticalStepper';
import VectorStoreStep from '../components/RagIngestion/steps/VectorStoreStep';
import EmbeddingModelStep from '../components/RagIngestion/steps/EmbeddingModelStep';
import ChunkingStep from '../components/RagIngestion/steps/ChunkingStep';
import AutomationStep from '../components/RagIngestion/steps/AutomationStep';
import DatasourceStep from '../components/RagIngestion/steps/DatasourceStep';
import type { OrgScope } from '../../nav';

const STEP_LABELS = ['Initialize Vector Store', 'Configure Embedding Model', 'Configure Chunking', 'Create Automation', 'Configure Datasource'];
const LAST_STEP = STEP_LABELS.length - 1;

export default function SetupRagIngestion(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const [form, dispatch] = useReducer(ragFormReducer, initialRagForm);
  const [activeStep, setActiveStep] = useState(0);
  const create = useCreateRagIngestion();
  const { data: projects } = useProjects();
  const orgUuid = useOrgUuid();
  const subscriptions = useSubscriptions(orgUuid ?? '');
  const isSubscribed = (subscriptions.data?.list ?? []).some((s) => s.subscriptionType === PAID_SUBSCRIPTION_TYPE);

  // On successful create + deploy, land on the new component's overview.
  useEffect(() => {
    if (!create.isSuccess || !create.componentHandler) return;
    const handler = (projects ?? []).find((p) => p.id === form.automation.projectId)?.handler;
    if (handler) navigate(componentOverviewUrl(scope.org, handler, create.componentHandler));
  }, [create.isSuccess, create.componentHandler, projects, form.automation.projectId, navigate, scope.org]);

  const stepValid = [isVectorStoreValid(form.vectorStore), isEmbeddingValid(form.embedding), isChunkingValid(form.chunking), isAutomationValid(form.automation), isDatasourceValid(form.datasource)];

  if (!isRagIngestionEnabled()) {
    return <ComingSoon title="Coming Soon" description="RAG Ingestion is currently under development." />;
  }

  const title = (
    <PageTitle>
      <PageTitle.Header>Scheduled Ingestion</PageTitle.Header>
    </PageTitle>
  );

  // Paid feature — free-tier orgs cannot set up RAG ingestion (mirrors Devant's RAGSubscriptionGate).
  if (subscriptions.isLoading) {
    return (
      <PageContent>
        {title}
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }
  if (!isSubscribed) {
    return (
      <PageContent>
        {title}
        <RagUpgradeRequired orgUuid={orgUuid} />
      </PageContent>
    );
  }

  const currentValid = stepValid[activeStep];

  return (
    <PageContent>
      {title}
      <Stack direction="row" gap={4} alignItems="flex-start" sx={{ mt: 3 }}>
        <Box sx={{ width: { xs: '100%', md: 240 }, flexShrink: 0, pt: 1 }}>
          <VerticalStepper activeStep={activeStep} steps={STEP_LABELS} />
        </Box>
        <Box sx={{ flex: 1, maxWidth: 900, mt: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Setup RAG Ingestion
          </Typography>

          {create.error && (
            <Alert severity="error" variant="outlined" onClose={create.reset} sx={{ mb: 3 }}>
              {create.error}
            </Alert>
          )}

          {activeStep === 0 && <VectorStoreStep value={form.vectorStore} onChange={(value) => dispatch({ type: 'vectorStore', value })} />}
          {activeStep === 1 && <EmbeddingModelStep value={form.embedding} onChange={(value) => dispatch({ type: 'embedding', value })} />}
          {activeStep === 2 && <ChunkingStep value={form.chunking} onChange={(value) => dispatch({ type: 'chunking', value })} />}
          {activeStep === 3 && <AutomationStep value={form.automation} onChange={(value) => dispatch({ type: 'automation', value })} />}
          {activeStep === 4 && <DatasourceStep value={form.datasource} onChange={(value) => dispatch({ type: 'datasource', value })} />}

          {create.isDeploying ? (
            <Box sx={{ mt: 4 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {create.stepLabel}
              </Typography>
              <LinearProgress variant="determinate" value={create.progress} />
            </Box>
          ) : (
            <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
              <Button variant="outlined" disabled={activeStep === 0} onClick={() => setActiveStep((s) => Math.max(0, s - 1))}>
                Back
              </Button>
              {activeStep < LAST_STEP ? (
                <Button variant="contained" disabled={!currentValid} onClick={() => setActiveStep((s) => Math.min(LAST_STEP, s + 1))}>
                  Next
                </Button>
              ) : (
                <Button variant="contained" disabled={!currentValid || create.isDeploying} startIcon={create.isDeploying ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={() => create.deploy({ orgHandler: scope.org, form })}>
                  Create Automation
                </Button>
              )}
            </Stack>
          )}
        </Box>
      </Stack>
    </PageContent>
  );
}
