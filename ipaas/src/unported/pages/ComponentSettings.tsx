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

import { PageContent } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { Navigate } from 'react-router';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { firstAvailableComponentSettingsSection } from '../../constants/componentSettingsSections';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useIntegrationIdentity } from '../../hooks/useIntegrationIdentity';
import { useProjectId } from '../../hooks/useProjects';
import { componentSettingsSectionUrl, type ComponentScope } from '../../nav';
import { Loading } from '../../components/Settings/AccessControl/shared';

/**
 * Integration (component) Settings landing route. Redirects to the first section
 * applicable to the integration type that the user can access; if none, sends
 * them back to the integration overview.
 */
export default function ComponentSettings({ org, project, component }: ComponentScope): JSX.Element {
  const { hasAnyPermission, isOrgPermissionsLoaded } = useAccessControl();
  const { projectId, isLoading } = useProjectId(project);
  const { data: comp, isLoading: loadingComponent } = useComponentByHandler(projectId, component);
  const identity = useIntegrationIdentity(comp);

  if (!isOrgPermissionsLoaded || isLoading || loadingComponent)
    return (
      <PageContent>
        <Loading />
      </PageContent>
    );

  const section = firstAvailableComponentSettingsSection(identity, (perms) => hasAnyPermission(perms, projectId || undefined, comp?.id));
  return <Navigate to={section ? componentSettingsSectionUrl({ org, project, component }, section.path) : `/organizations/${org}/projects/${project}/components/${component}/overview`} replace />;
}
