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

import { Alert, Box, CircularProgress, Link, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { Info } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import DeploymentTrackBar from '../../components/DeploymentTrackBar';
import WebhookSnippets from '../components/ExternalCI/WebhookSnippets';
import CiTokensTable from '../components/ExternalCI/CiTokensTable';
import ComingSoon from '../../pages/ComingSoon';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { Permissions } from '../../constants/permissions';
import { isExternalCiEnabled } from '../hooks/useExternalCi';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useProjectId } from '../../hooks/useProjects';
import { isByoiComponent } from '../../constants/integrations';
import { EXTERNAL_CI_DOC_URL } from '../utils/externalCi';
import type { ComponentScope } from '../../nav';

export default function ComponentExternalCI({ org, project, component }: ComponentScope): JSX.Element {
  const { projectId } = useProjectId(project);
  const { hasPermission } = useAccessControl();
  const { data: comp, isLoading } = useComponentByHandler(projectId, component);
  const canManage = hasPermission(Permissions.INTEGRATION_MANAGE, projectId, comp?.id);

  const tracks = useMemo(() => comp?.deploymentTracks ?? [], [comp?.deploymentTracks]);
  const [trackId, setTrackId] = useState('');
  useEffect(() => {
    if (tracks.length) setTrackId((prev) => (prev && tracks.some((t) => t.id === prev) ? prev : (tracks.find((t) => t.latest)?.id ?? tracks[0].id)));
  }, [tracks]);

  if (!isExternalCiEnabled()) {
    return <ComingSoon title="Coming Soon" description="External CI configuration is currently under development." />;
  }

  const isByoi = isByoiComponent(comp?.displayType ?? '');

  return (
    <Box>
      {tracks.length > 0 && <DeploymentTrackBar tracks={tracks} selectedId={trackId} onChange={setTrackId} orgHandler={org} projectHandler={project} componentHandler={component} versionView />}
      <PageContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
            <CircularProgress />
          </Box>
        ) : !comp ? (
          <Alert severity="error">Integration not found</Alert>
        ) : !isByoi ? (
          <Alert severity="info">External CI is only available for Bring-Your-Own-Image integrations, which deploy a pre-built container image.</Alert>
        ) : (
          <>
            <Alert severity="info" icon={false} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Enable Automatic Deployments using an External CI/Build Pipeline
              </Typography>
              <Typography variant="body2">
                The platform doesn&apos;t build container images itself, but you can integrate deployment into your existing CI or build pipeline using a webhook. This feature is fully available on private data planes; on the cloud data plane you can create a
                token to test the feature but cannot invoke the webhook.
              </Typography>
            </Alert>

            <Link href={EXTERNAL_CI_DOC_URL} target="_blank" rel="noopener" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 3 }}>
              <Info size={14} />
              <Typography variant="body2" component="span">
                How does this work?
              </Typography>
            </Link>

            <Stack gap={4}>
              <WebhookSnippets componentId={comp.id} versionId={trackId} />
              <CiTokensTable projectId={projectId} componentId={comp.id} canManage={canManage} />
            </Stack>
          </>
        )}
      </PageContent>
    </Box>
  );
}
