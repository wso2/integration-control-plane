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
import { useAccessControl } from '../contexts/AccessControlContext';
import { firstAvailableProjectSettingsSection } from '../constants/projectSettingsSections';
import { useProjectId } from '../hooks/useProjects';
import { projectSettingsSectionUrl, type ProjectScope } from '../nav';
import { Loading } from '../components/Settings/AccessControl/shared';

/**
 * Project Settings landing route. Redirects to the first section the user can
 * access; if none, sends them back to the project home.
 */
export default function ProjectSettings({ org, project }: ProjectScope): JSX.Element {
  const { hasAnyPermission, isOrgPermissionsLoaded } = useAccessControl();
  const { projectId, isLoading } = useProjectId(project);

  if (!isOrgPermissionsLoaded || isLoading)
    return (
      <PageContent fullWidth>
        <Loading />
      </PageContent>
    );

  const section = firstAvailableProjectSettingsSection((perms) => hasAnyPermission(perms, projectId || undefined));
  return <Navigate to={section ? projectSettingsSectionUrl({ org, project }, section.path) : `/organizations/${org}/projects/${project}`} replace />;
}
