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
import { GitBranch, Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useEnvTemplates, useOrgDeploymentPipelines } from '../hooks/useDeploymentPipelines';
import type { DeploymentPipeline } from '../types/deploymentPipeline';
import { pinDefaultFirst } from '../utils/deploymentPipeline';
import { cdPipelineEditorUrl, type OrgScope } from '../nav';
import EmptyListing from '../components/EmptyListing';
import SearchField from '../components/SearchField';
import PipelineAccordionCard from '../components/CdPipelines/PipelineAccordionCard';
import DeletePipelineDialog from '../components/CdPipelines/DeletePipelineDialog';

// Cloud cannot create pipelines, so the empty state describes them instead of
// pointing at an action that isn't there.
const EMPTY_DESCRIPTION = 'Create a pipeline to define how integrations promote across environments.';

export default function OrgCdPipelines(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { data: pipelines, isLoading, isError, refetch } = useOrgDeploymentPipelines();
  const { data: envTemplates } = useEnvTemplates(scope.org);
  const orderedPipelines = useMemo(() => (pipelines ? pinDefaultFirst(pipelines, (p) => !!p.is_default) : pipelines), [pipelines]);
  const [search, setSearch] = useState('');
  const filteredPipelines = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? orderedPipelines?.filter((p) => p.name.toLowerCase().includes(s)) : orderedPipelines;
  }, [orderedPipelines, search]);
  const [deleting, setDeleting] = useState<DeploymentPipeline | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Deployment Pipelines</PageTitle.Header>
        <PageTitle.SubHeader>Promotion paths across environments, available to every project in this organization.</PageTitle.SubHeader>
      </PageTitle>

      {!!pipelines?.length && (
        <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 5 }}>
          <SearchField value={search} onChange={setSearch} placeholder="Search pipelines..." fullWidth />
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => navigate(cdPipelineEditorUrl(scope))} sx={{ whiteSpace: 'nowrap', flexShrink: 0, px: 2.5 }}>
            Create Pipeline
          </Button>
        </Stack>
      )}

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
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
        <EmptyListing icon={<GitBranch size={48} />} title="No deployment pipelines" description={EMPTY_DESCRIPTION} showAction actionLabel="Create Pipeline" onAction={() => navigate(cdPipelineEditorUrl(scope))} />
      ) : !filteredPipelines?.length ? (
        <EmptyListing icon={<GitBranch size={48} />} title="No deployment pipelines found" description="Try adjusting your search" showAction={false} />
      ) : (
        <Stack gap={3}>
          {filteredPipelines.map((pipeline) => (
            <PipelineAccordionCard
              key={pipeline.id}
              name={pipeline.name}
              isDefault={!!pipeline.is_default}
              tree={pipeline.promotion_tree}
              envTemplates={envTemplates}
              actions={
                <>
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      aria-label={`Edit ${pipeline.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(cdPipelineEditorUrl(scope, pipeline.id));
                      }}>
                      <Pencil size={16} />
                    </IconButton>
                  </Tooltip>
                  {!pipeline.is_default && (
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`Delete ${pipeline.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(pipeline);
                        }}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                </>
              }
            />
          ))}
        </Stack>
      )}

      {deleting && <DeletePipelineDialog pipeline={deleting} onClose={() => setDeleting(null)} onDeleted={(name) => setAlert({ type: 'success', message: `Pipeline '${name}' deleted.` })} onError={(message) => setAlert({ type: 'error', message })} />}
    </PageContent>
  );
}
