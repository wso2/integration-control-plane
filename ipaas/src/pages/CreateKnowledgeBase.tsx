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

import { Alert, Box, Button, CircularProgress, PageContent, PageTitle, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { usePlanAccess } from '../hooks/useBillingOrg';
import { SCHEDULE_POLICIES } from '../constants/scheduleLimits';
import { Scopes } from '../constants/permissions';
import { useCan } from '../hooks/useCan';
import { useCreateKnowledgeBase } from '../hooks/useKnowledgeBases';
import { knowledgeBaseUrl, knowledgeBasesUrl, type OrgScope } from '../nav';
import { DATASOURCES, DEFAULT_CHUNKING } from '../constants/ragIngestion';
import { buildDataSourceSettings, buildKnowledgeBaseSettings, dataSourceNameFor, isNameValid, type NameFields } from '../utils/knowledgeBase';
import { isChunkingValid, isDatasourceValid, isEmbeddingValid, isVectorStoreValid } from '../utils/ragIngestion';
import type { ChunkingConfig, DatasourceConfig, EmbeddingConfig, VectorStoreConfig } from '../types/ragIngestion';
import type { CreateKnowledgeBaseDataSourceInput } from '../types/knowledgeBase';
import { useScheduleForm } from '../components/Overview/_shared/useScheduleForm';
import VerticalStepper from '../components/VerticalStepper';
import NameStep from '../components/KnowledgeBase/steps/NameStep';
import VectorStoreStep from '../components/KnowledgeBase/steps/VectorStoreStep';
import EmbeddingModelStep from '../components/KnowledgeBase/steps/EmbeddingModelStep';
import ChunkingStep from '../components/KnowledgeBase/steps/ChunkingStep';
import DatasourceStep from '../components/KnowledgeBase/steps/DatasourceStep';
import IngestionScheduleStep, { type IngestionMode } from '../components/KnowledgeBase/steps/IngestionScheduleStep';
import { wizardActionsSx, wizardBodySx, wizardLayoutSx, wizardStepperSx } from './KnowledgeBase.styles';

const STEPS = ['Name', 'Vector Store', 'Embedding Model', 'Chunking', 'Data Source', 'Ingestion Schedule'];
const DATA_SOURCE_STEP = 4;
const LAST_STEP = STEPS.length - 1;

export default function CreateKnowledgeBase(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(knowledgeBasesUrl(scope))} sx={{ mb: 2 }}>
        Back to Knowledge Bases
      </Button>
      <PageTitle>
        <PageTitle.Header>Create Knowledge Base</PageTitle.Header>
      </PageTitle>
      <CreateKnowledgeBaseWizard scope={scope} />
    </PageContent>
  );
}

function CreateKnowledgeBaseWizard({ scope }: { scope: OrgScope }): JSX.Element {
  const navigate = useAppNavigate();
  const create = useCreateKnowledgeBase();
  const canManage = useCan()(Scopes.CONFIG_MANAGE);
  const [step, setStep] = useState(0);
  const [names, setNames] = useState<NameFields>({ displayName: '', name: '', description: '' });
  const [vectorStore, setVectorStore] = useState<VectorStoreConfig | null>(null);
  const [embedding, setEmbedding] = useState<EmbeddingConfig | null>(null);
  const [chunking, setChunking] = useState<ChunkingConfig>(DEFAULT_CHUNKING);
  const [datasource, setDatasource] = useState<DatasourceConfig | null>(null);
  const [mode, setMode] = useState<IngestionMode>('scheduled');
  const schedule = useScheduleForm(null, usePlanAccess(), SCHEDULE_POLICIES.ingestion);

  const stepValid = [isNameValid(names), isVectorStoreValid(vectorStore), isEmbeddingValid(embedding), isChunkingValid(chunking), isDatasourceValid(datasource), mode === 'once' || schedule.isValid];

  const submit = (withDataSource: boolean) => {
    // Every step before the data source has been validated to get here.
    if (!vectorStore || !embedding) return;
    let dataSource: CreateKnowledgeBaseDataSourceInput | null = null;
    if (withDataSource && datasource) {
      const label = DATASOURCES.find((d) => d.id === datasource.type)?.name ?? datasource.type;
      dataSource = {
        name: dataSourceNameFor(names.name, datasource.type),
        displayName: `${names.displayName} ${label}`,
        ...buildDataSourceSettings(datasource),
        cronExpression: mode === 'scheduled' ? schedule.cron : '',
        cronTimezone: mode === 'scheduled' ? schedule.timezone : '',
      };
    }
    create.mutate(
      { name: names.name, displayName: names.displayName.trim(), description: names.description.trim(), ...buildKnowledgeBaseSettings(vectorStore, embedding, chunking), dataSource },
      { onSuccess: (kb) => navigate(knowledgeBaseUrl(scope, kb.name)) },
    );
  };

  return (
    <Stack direction="row" gap={4} alignItems="flex-start" sx={wizardLayoutSx}>
      <Box sx={wizardStepperSx}>
        <VerticalStepper activeStep={step} steps={STEPS} />
      </Box>
      <Box sx={wizardBodySx}>
        {create.error && (
          <Alert severity="error" variant="outlined" onClose={create.reset} sx={{ mb: 3 }}>
            {create.error.message}
          </Alert>
        )}

        {step === 0 && <NameStep heading="Name the Knowledge Base" value={names} onChange={setNames} />}
        {step === 1 && <VectorStoreStep value={vectorStore} onChange={setVectorStore} />}
        {step === 2 && <EmbeddingModelStep value={embedding} onChange={setEmbedding} />}
        {step === 3 && <ChunkingStep value={chunking} onChange={setChunking} />}
        {step === DATA_SOURCE_STEP && (
          <>
            <DatasourceStep value={datasource} onChange={setDatasource} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              You can also create the knowledge base now and add data sources to it later.
            </Typography>
          </>
        )}
        {step === LAST_STEP && <IngestionScheduleStep mode={mode} onModeChange={setMode} schedule={schedule} />}

        <Stack direction="row" gap={1.5} sx={wizardActionsSx}>
          <Button variant="outlined" disabled={create.isPending} onClick={() => (step === 0 ? navigate(knowledgeBasesUrl(scope)) : setStep((s) => s - 1))}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step === DATA_SOURCE_STEP && (
            <Button variant="outlined" disabled={!canManage || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={() => submit(false)}>
              Create Without Data Source
            </Button>
          )}
          {step < LAST_STEP ? (
            <Button variant="contained" disabled={!stepValid[step] || create.isPending} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button variant="contained" disabled={!canManage || !stepValid[step] || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={() => submit(true)}>
              {create.isPending ? 'Creating…' : 'Create Knowledge Base'}
            </Button>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
