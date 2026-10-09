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

import { Box, CircularProgress, PageContent, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { isConnectionsEnabled } from '../hooks/useConnections';
import { useProjectId } from '../../hooks/useProjects';
import { useComponentByHandler } from '../../hooks/useComponents';
import { componentConnectionsBase } from '../utils/connections';
import { areComponentConnectionsAllowed } from '../constants/connections';
import ConnectionsLanding from '../components/Connections/ConnectionsLanding';
import ComingSoon from '../../pages/ComingSoon';
import type { ComponentScope } from '../../nav';

export default function ComponentConnections({ org, project, component }: ComponentScope): JSX.Element {
  const { projectId, isLoading: loadingProject } = useProjectId(project);
  const { data: comp, isLoading: loadingComponent } = useComponentByHandler(projectId, component);

  if (!isConnectionsEnabled()) {
    return <ComingSoon title="Coming Soon" description="Connections management is currently under development." />;
  }

  const base = componentConnectionsBase(org, project, component);
  const isLoading = loadingProject || loadingComponent;

  if (isLoading) {
    return (
      <PageContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }
  if (!projectId || !comp) {
    return (
      <PageContent>
        <Typography>Component not found</Typography>
      </PageContent>
    );
  }

  if (!areComponentConnectionsAllowed(comp.displayType, comp.componentSubType)) {
    return <ComingSoon title="Connections unavailable" description="Connections aren’t available for this integration type." />;
  }

  return <ConnectionsLanding key={comp.id} projectId={projectId} componentId={comp.id} base={base} />;
}
