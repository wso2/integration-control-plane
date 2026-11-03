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
import { Navigate, useLocation } from 'react-router';
import { useAccessControl } from '../contexts/AccessControlContext';
import { firstAvailableComponentSettingsSection } from '../constants/componentSettingsSections';
import { useComponentByHandler } from '../hooks/useComponents';
import { useIntegrationIdentity } from '../hooks/useIntegrationIdentity';
import { useProjectId } from '../hooks/useProjects';
import { withTrackParam } from '../hooks/useSelectedTrack';
import { componentSettingsSectionUrl, overviewUrl, type ComponentScope } from '../nav';
import { Loading } from '../components/Settings/AccessControl/shared';

/**
 * Integration Settings landing route. Redirects to the first section that
 * applies to the integration and that the user can access; if none, sends them
 * back to the integration's overview.
 */
export default function ComponentSettings(scope: ComponentScope): JSX.Element {
  const { hasAnyPermission, isOrgPermissionsLoaded } = useAccessControl();
  const { search } = useLocation();
  const { projectId, isLoading: loadingProject } = useProjectId(scope.project);
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const identity = useIntegrationIdentity(component);

  if (!isOrgPermissionsLoaded || loadingProject || loadingComponent)
    return (
      <PageContent fullWidth>
        <Loading />
      </PageContent>
    );

  const section = firstAvailableComponentSettingsSection(identity, (perms) => hasAnyPermission(perms, projectId || undefined, component?.id));
  const target = section ? componentSettingsSectionUrl(scope, section.path) : overviewUrl({ ...scope, level: 'components' });
  return <Navigate to={withTrackParam(target, search)} replace />;
}
