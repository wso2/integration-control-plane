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

import { Alert, Box, Button, CircularProgress, IconButton, PageContent, PageTitle, Stack, Tooltip } from '@wso2/oxygen-ui';
import { GitBranch, Plus, Repeat, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { IS_CLOUD } from '../features';
import { useEnvTemplates, useProjectDeploymentPipelines } from '../hooks/useDeploymentPipelines';
import { useProjectId } from '../hooks/useProjects';
import type { DeploymentPipeline } from '../types/deploymentPipeline';
import { pinDefaultFirst } from '../utils/deploymentPipeline';
import type { ProjectScope } from '../nav';
import EmptyListing from '../components/EmptyListing';
import PipelineAccordionCard from '../components/CdPipelines/PipelineAccordionCard';
import AddProjectPipelineDialog from '../components/CdPipelines/AddProjectPipelineDialog';
import RemoveProjectPipelineDialog from '../components/CdPipelines/RemoveProjectPipelineDialog';
import SetDefaultPipelineDialog from '../components/CdPipelines/SetDefaultPipelineDialog';

// Cloud cannot add pipelines, so the empty state describes them instead of
// pointing at an action that isn't there.
const EMPTY_DESCRIPTION = 'Add an organization pipeline to define how integrations promote across environments.';

export default function ProjectCdPipelines(scope: ProjectScope): JSX.Element {
  const { projectId, isLoading: resolvingProject } = useProjectId(scope.project);
  const { data: pipelines, isLoading, isError, refetch } = useProjectDeploymentPipelines(projectId);
  const { data: envTemplates } = useEnvTemplates(scope.org);

  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<DeploymentPipeline | null>(null);
  const [settingDefault, setSettingDefault] = useState<DeploymentPipeline | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const orderedPipelines = useMemo(() => (pipelines ? pinDefaultFirst(pipelines, (p) => !!p.is_project_default) : pipelines), [pipelines]);
  const currentPipelineIds = useMemo(() => (pipelines ?? []).map((p) => p.id), [pipelines]);

  return (
    <PageContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <PageTitle>
          <PageTitle.Header>Deployment Pipeline</PageTitle.Header>
          <PageTitle.SubHeader>The promotion path this project's integrations deploy along.</PageTitle.SubHeader>
        </PageTitle>
        {/* Cloud binds one pipeline per project, so adding a second is really a swap. */}
        {!!pipelines?.length && (
          <Button variant="contained" startIcon={IS_CLOUD ? <Repeat size={18} /> : <Plus size={20} />} onClick={() => setAddOpen(true)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {IS_CLOUD ? 'Change Pipeline' : 'Add Pipeline'}
          </Button>
        )}
      </Stack>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {resolvingProject || isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load deployment pipelines.
        </Alert>
      ) : !pipelines?.length ? (
        <EmptyListing icon={<GitBranch size={48} />} title="No deployment pipelines" description={EMPTY_DESCRIPTION} showAction actionLabel="Add Pipeline" onAction={() => setAddOpen(true)} />
      ) : (
        <Stack gap={3}>
          {orderedPipelines?.map((pipeline) => (
            <PipelineAccordionCard
              key={pipeline.id}
              name={pipeline.name}
              isDefault={!!pipeline.is_project_default}
              tree={pipeline.promotion_tree}
              envTemplates={envTemplates}
              actions={
                <>
                  {!pipeline.is_project_default && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettingDefault(pipeline);
                      }}
                      sx={{ textTransform: 'none' }}>
                      Set as default
                    </Button>
                  )}
                  <Tooltip title={pipeline.is_project_default ? 'The default pipeline cannot be removed' : 'Remove'}>
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={pipeline.is_project_default}
                        aria-label={`Remove ${pipeline.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoving(pipeline);
                        }}>
                        <Trash2 size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              }
            />
          ))}
        </Stack>
      )}

      {addOpen && (
        <AddProjectPipelineDialog
          projectId={projectId}
          currentPipelineIds={currentPipelineIds}
          onClose={() => setAddOpen(false)}
          onDone={() => setAlert({ type: 'success', message: 'Pipelines added.' })}
          onError={(message) => setAlert({ type: 'error', message })}
        />
      )}

      {removing && (
        <RemoveProjectPipelineDialog
          projectId={projectId}
          pipeline={removing}
          currentPipelineIds={currentPipelineIds}
          onClose={() => setRemoving(null)}
          onDone={(name) => setAlert({ type: 'success', message: `Pipeline '${name}' removed.` })}
          onError={(message) => setAlert({ type: 'error', message })}
        />
      )}

      {settingDefault && (
        <SetDefaultPipelineDialog
          projectId={projectId}
          pipeline={settingDefault}
          onClose={() => setSettingDefault(null)}
          onDone={(name) => setAlert({ type: 'success', message: `'${name}' is now the project default.` })}
          onError={(message) => setAlert({ type: 'error', message })}
        />
      )}
    </PageContent>
  );
}
