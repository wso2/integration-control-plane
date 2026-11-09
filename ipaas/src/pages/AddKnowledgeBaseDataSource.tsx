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

import { Alert, Box, Button, CircularProgress, PageContent, PageTitle, Skeleton, Stack } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { usePlanAccess } from '../hooks/useBillingOrg';
import { SCHEDULE_POLICIES } from '../constants/scheduleLimits';
import { Scopes } from '../constants/permissions';
import { useCan } from '../hooks/useCan';
import { useCreateKnowledgeBaseDataSource, useKnowledgeBase } from '../hooks/useKnowledgeBases';
import { knowledgeBaseUrl, knowledgeBasesUrl, type OrgScope } from '../nav';
import { buildDataSourceSettings, isNameValid, type NameFields } from '../utils/knowledgeBase';
import { isDatasourceValid } from '../utils/ragIngestion';
import type { DatasourceConfig } from '../types/ragIngestion';
import { isNotFoundError } from '../utils/apiErrors';
import PageNotFound from './PageNotFound';
import { useScheduleForm } from '../components/Overview/_shared/useScheduleForm';
import VerticalStepper from '../components/VerticalStepper';
import NameStep from '../components/KnowledgeBase/steps/NameStep';
import DatasourceStep from '../components/KnowledgeBase/steps/DatasourceStep';
import IngestionScheduleStep, { type IngestionMode } from '../components/KnowledgeBase/steps/IngestionScheduleStep';
import { wizardActionsSx, wizardBodySx, wizardLayoutSx, wizardStepperSx } from './KnowledgeBase.styles';

const STEPS = ['Name', 'Data Source', 'Ingestion Schedule'];
const LAST_STEP = STEPS.length - 1;

export default function AddKnowledgeBaseDataSource(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { knowledgeBase: name = '' } = useParams();
  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(knowledgeBaseUrl(scope, name))} sx={{ mb: 2 }}>
        Back to Knowledge Base
      </Button>
      <DataSourceLoader scope={scope} name={name} />
    </PageContent>
  );
}

function DataSourceLoader({ scope, name }: { scope: OrgScope; name: string }): JSX.Element {
  const { data: kb, isLoading, isError, error, refetch } = useKnowledgeBase(name);
  if (isLoading) {
    return (
      <Stack gap={2}>
        <Skeleton variant="text" width={360} height={48} />
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  }
  if (isNotFoundError(error)) return <PageNotFound title="Knowledge base not found" actionTo={knowledgeBasesUrl(scope)} actionLabel="Back to Knowledge Bases" />;
  if (isError || !kb) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Could not load the knowledge base.
      </Alert>
    );
  }
  return (
    <>
      <PageTitle>
        <PageTitle.Header>Add Data Source</PageTitle.Header>
        <PageTitle.SubHeader>Load documents into {kb.displayName}.</PageTitle.SubHeader>
      </PageTitle>
      <DataSourceWizard scope={scope} knowledgeBase={kb.name} />
    </>
  );
}

function DataSourceWizard({ scope, knowledgeBase }: { scope: OrgScope; knowledgeBase: string }): JSX.Element {
  const navigate = useAppNavigate();
  const create = useCreateKnowledgeBaseDataSource(knowledgeBase);
  const canManage = useCan()(Scopes.CONFIG_MANAGE);
  const [step, setStep] = useState(0);
  const [names, setNames] = useState<NameFields>({ displayName: '', name: '', description: '' });
  const [datasource, setDatasource] = useState<DatasourceConfig | null>(null);
  const [mode, setMode] = useState<IngestionMode>('scheduled');
  const schedule = useScheduleForm(null, usePlanAccess(), SCHEDULE_POLICIES.ingestion);
  const stepValid = [isNameValid(names), isDatasourceValid(datasource), mode === 'once' || schedule.isValid];

  const submit = () => {
    if (!datasource) return;
    create.mutate(
      {
        name: names.name,
        displayName: names.displayName.trim(),
        ...buildDataSourceSettings(datasource),
        cronExpression: mode === 'scheduled' ? schedule.cron : '',
        cronTimezone: mode === 'scheduled' ? schedule.timezone : '',
      },
      { onSuccess: () => navigate(knowledgeBaseUrl(scope, knowledgeBase)) },
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

        {step === 0 && <NameStep heading="Name the Data Source" value={names} onChange={setNames} withDescription={false} />}
        {step === 1 && <DatasourceStep value={datasource} onChange={setDatasource} />}
        {step === LAST_STEP && <IngestionScheduleStep mode={mode} onModeChange={setMode} schedule={schedule} />}

        <Stack direction="row" gap={1.5} sx={wizardActionsSx}>
          <Button variant="outlined" disabled={create.isPending} onClick={() => (step === 0 ? navigate(knowledgeBaseUrl(scope, knowledgeBase)) : setStep((s) => s - 1))}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < LAST_STEP ? (
            <Button variant="contained" disabled={!stepValid[step]} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button variant="contained" disabled={!canManage || !stepValid[step] || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={submit}>
              {create.isPending ? 'Adding…' : 'Add Data Source'}
            </Button>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
