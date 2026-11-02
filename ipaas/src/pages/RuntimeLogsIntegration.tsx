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

import { Box, CircularProgress, PageContent } from '@wso2/oxygen-ui';
import { ScrollText } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useOrgs } from '../hooks/useOrg';
import { useProjects } from '../hooks/useProjects';
import { useComponentByHandler } from '../hooks/useComponents';
import { useEnvironments, useAllEnvironments } from '../hooks/useEnvironments';
import IntegrationLogs from '../components/Logs/IntegrationLogs';
import LogsPageLayout from '../components/Logs/LogsPageLayout';
import EmptyListing from '../components/EmptyListing';
import NotFound from '../components/NotFound';
import { broaden, resourceUrl, type ComponentScope } from '../nav';

export default function RuntimeLogsIntegration(scope: ComponentScope): JSX.Element {
  const { data: orgs, isLoading: loadingOrgs } = useOrgs();
  const { data: projects, isLoading: loadingProjects } = useProjects();

  const project = projects?.find((p) => p.id === scope.project || p.handler === scope.project);
  const projectId = project?.id ?? '';
  const orgUuid = orgs?.find((o) => o.handle === scope.org)?.uuid ?? '';

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);

  const { data: projectEnvs = [], isLoading: loadingProjectEnvs } = useEnvironments(orgUuid, projectId);
  const { data: globalEnvs = [], isLoading: loadingGlobalEnvs } = useAllEnvironments();
  // Prefer project-scoped environments (needs UUID); fall back to global when UUID unavailable
  const environments = orgUuid ? projectEnvs : globalEnvs;
  const loadingEnvironments = orgUuid ? loadingProjectEnvs : loadingGlobalEnvs;

  if (loadingOrgs || loadingProjects || loadingComponent || loadingEnvironments) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!component) {
    return <NotFound message="Integration not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to project" />;
  }

  if (environments.length === 0) {
    return (
      <PageContent fullWidth>
        <EmptyListing icon={<ScrollText size={48} />} title="No environments available" description="No deployment environments were found for this project. Deploy your integration first." />
      </PageContent>
    );
  }

  return (
    <IntegrationLogs orgHandler={scope.org} orgUuid={orgUuid} component={component} environments={environments} region={project?.region} filtersKey={`${scope.org}/${scope.project}/${scope.component}`}>
      {({ toolbar, viewer }) => <LogsPageLayout title="Runtime Logs" filtersElement={toolbar} logPanelElement={viewer} />}
    </IntegrationLogs>
  );
}
