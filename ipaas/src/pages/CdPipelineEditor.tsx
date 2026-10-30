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

import { Alert, Box, Button, CircularProgress, PageContent } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { useEnvTemplates, useOrgDeploymentPipelines } from '../hooks/useDeploymentPipelines';
import { orgCdPipelinesUrl } from '../nav';
import NotFound from '../components/NotFound';
import CdPipelineForm from '../components/CdPipelines/CdPipelineForm';

/**
 * Route page for creating/editing a CD pipeline. Resolves the org + optional
 * pipeline id from the URL, loads the env templates (and the pipeline for edit),
 * handles loading/error/not-found, then hands off to the form — keyed by
 * pipeline id so its state seeds on mount.
 */
export default function CdPipelineEditor(): JSX.Element {
  const { orgHandler = 'default', pipelineId } = useParams();
  const isEdit = !!pipelineId;

  const { data: envTemplates, isLoading: loadingEnvs, isError: envError, refetch: refetchEnvs } = useEnvTemplates(orgHandler);
  const { data: pipelines, isLoading: loadingPipelines, isError: pipelinesError, refetch: refetchPipelines } = useOrgDeploymentPipelines();

  if (loadingEnvs || (isEdit && loadingPipelines)) {
    return (
      <PageContent fullWidth>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }

  if (envError || !envTemplates) {
    return (
      <PageContent fullWidth>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetchEnvs()}>
              Retry
            </Button>
          }>
          Failed to load environment templates.
        </Alert>
      </PageContent>
    );
  }

  // Edit mode needs the pipeline list to resolve `existing`; surface a load
  // failure here rather than letting it fall through to "Pipeline not found".
  if (isEdit && pipelinesError) {
    return (
      <PageContent fullWidth>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetchPipelines()}>
              Retry
            </Button>
          }>
          Failed to load deployment pipelines.
        </Alert>
      </PageContent>
    );
  }

  const existing = isEdit ? pipelines?.find((p) => p.id === pipelineId) : undefined;
  if (isEdit && !existing) {
    return <NotFound message="Pipeline not found" backTo={orgCdPipelinesUrl({ org: orgHandler })} backLabel="Back to CD Pipelines" />;
  }

  return <CdPipelineForm key={pipelineId ?? 'new'} orgHandler={orgHandler} envTemplates={envTemplates} existingPipelines={pipelines ?? []} existing={existing} />;
}
