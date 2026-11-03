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

import { Alert, Button, CircularProgress, Typography } from '@wso2/oxygen-ui';
import { useLinkWarnings, useResourceLinks } from '../../hooks/useConfiguration';
import { useDeployDeploymentTrack } from '../../hooks/useDeployments';
import type { ResourceLink } from '../../types/configuration';
import { LinkSuggestions } from '../EnvironmentCard/LinkSuggestions';

interface LinkWarningsProps {
  projectId: string;
  componentId: string;
  versionId: string;
  build: string;
  firstEnvId: string;
  deploymentPipelineId: string;
}

const alertSx = { my: 1 } as const;
const noLinks: ResourceLink[] = [];

/** Where a build and the integration's links disagree: Change link for a connection the build doesn't read, Deploy for names not applied yet. */
export function LinkWarnings({ projectId, componentId, versionId, build, firstEnvId, deploymentPipelineId }: LinkWarningsProps) {
  const { data: warnings = [] } = useLinkWarnings(projectId, componentId, build, true);
  const { data: links = noLinks } = useResourceLinks(projectId, componentId, true);
  const deploy = useDeployDeploymentTrack();
  const notInBuild = warnings.filter((w) => w.reason === 'not_in_build');
  const notApplied = warnings.filter((w) => w.reason === 'not_applied');

  return (
    <>
      {notInBuild.length > 0 && (
        <Alert severity="warning" sx={alertSx}>
          {notInBuild.map((w) => (
            <Typography key={w.resourceType} variant="body2">
              {w.resourceType}: this build doesn&apos;t read {w.connection.slice(w.connection.lastIndexOf('.') + 1)}&apos;s names
            </Typography>
          ))}
        </Alert>
      )}
      <LinkSuggestions projectId={projectId} componentId={componentId} open links={links} build={build} actions={['Change link']} bare />
      {notApplied.length > 0 && (
        <Alert
          severity="warning"
          sx={alertSx}
          action={
            <Button
              size="small"
              color="inherit"
              startIcon={deploy.isPending ? <CircularProgress size={14} /> : undefined}
              disabled={deploy.isPending || !firstEnvId}
              onClick={() => deploy.mutate({ componentId, id: versionId, imageId: build, environmentId: firstEnvId, deploymentPipelineId })}>
              Deploy
            </Button>
          }>
          Links not applied yet: {notApplied.map((w) => w.resourceType).join(', ')}
        </Alert>
      )}
      {deploy.isError && (
        <Alert severity="error" sx={alertSx}>
          {deploy.error instanceof Error ? deploy.error.message : 'Failed to deploy the build'}
        </Alert>
      )}
    </>
  );
}
