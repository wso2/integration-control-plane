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

import { Box, CircularProgress, PageContent, ToggleButton, ToggleButtonGroup, Typography } from '@wso2/oxygen-ui';
import { type JSX, useState } from 'react';
import { useCloudDataPlanes, useEnvironments } from '../../hooks/useEnvironments';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useOrgs } from '../../hooks/useOrg';
import AlertsConfigurePage from '../components/Alerts/AlertsConfigurePage';
import AlertsHistoryPage from '../components/Alerts/AlertsHistoryPage';
import type { ComponentScope } from '../../nav';
import { UUID_RE } from '../../utils/string';
import { useProjectId } from '../../hooks/useProjects';

export default function Alerts(scope: ComponentScope): JSX.Element {
  const [activeTab, setActiveTab] = useState(0);

  const isProjectUuid = UUID_RE.test(scope.project);
  const { projectId: projectIdFromHook, project, isLoading: loadingProject } = useProjectId(scope.project);
  const projectId = isProjectUuid ? scope.project : projectIdFromHook;

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const componentId = component?.id ?? '';

  const { data: orgs, isLoading: loadingOrgs } = useOrgs();
  const orgUuid = orgs?.find((o) => o.handle === scope.org)?.uuid ?? '';

  const { data: environments = [], isLoading: loadingEnvironments } = useEnvironments(orgUuid, projectId);

  const { data: cloudDataPlanes = [], isLoading: loadingCdps } = useCloudDataPlanes(orgUuid);

  const isLoading = (!isProjectUuid && loadingProject) || loadingComponent || loadingOrgs || loadingEnvironments || loadingCdps;

  if (isLoading) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }

  if (!component) {
    return (
      <PageContent>
        <Typography color="error">Failed to load component information.</Typography>
      </PageContent>
    );
  }

  const projectName = project?.name ?? scope.project;

  const apiVersions = component.apiVersions ?? [];
  const activeVersion = apiVersions.find((v) => v.latest) ?? apiVersions[0];
  const versionId = activeVersion?.id ?? '';
  const versionName = activeVersion ? `${activeVersion.branch} | ${activeVersion.apiVersion}` : componentId;
  const isProxy = /proxy/i.test(component.displayType ?? '');
  const hasPublicOrOrgVisibility = apiVersions.some((v) => v.accessibility === 'Public' || v.accessibility === 'Organization');

  if (environments.length === 0) {
    return (
      <PageContent>
        <Typography variant="h1" sx={{ mb: 2 }}>
          Alerts
        </Typography>
        <Typography color="text.secondary">No environments configured. Please add an environment to manage alert rules.</Typography>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h1">Alerts</Typography>
        <ToggleButtonGroup
          value={activeTab}
          exclusive
          size="small"
          color="primary"
          onChange={(_, v) => {
            if (v !== null) setActiveTab(v);
          }}>
          <ToggleButton value={0}>Configure Alerts</ToggleButton>
          <ToggleButton value={1}>Alerts History</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {activeTab === 0 && (
        <AlertsConfigurePage
          componentId={componentId}
          projectId={projectId}
          projectName={projectName}
          versionId={versionId}
          versionName={versionName}
          isProxy={isProxy}
          hasPublicOrOrgVisibility={hasPublicOrOrgVisibility}
          environments={environments}
          cloudDataPlanes={cloudDataPlanes}
        />
      )}

      {activeTab === 1 && <AlertsHistoryPage componentId={componentId} environments={environments} cloudDataPlanes={cloudDataPlanes} />}
    </PageContent>
  );
}
