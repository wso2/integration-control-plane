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

import type { JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { visibleComponentSettingsSections } from '../../constants/componentSettingsSections';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useIntegrationIdentity } from '../../hooks/useIntegrationIdentity';
import { useProjectId } from '../../hooks/useProjects';
import { componentSettingsSectionUrl, hasComponent, useScope } from '../../nav';
import SettingsTabs from './SettingsTabs';

/**
 * The Integration (component) Settings header — resolves the sections applicable
 * to this integration type that the user can access, and delegates chrome to
 * `SettingsTabs`.
 */
export default function ComponentSettingsTabs({ active }: { active: string }): JSX.Element {
  const scope = useScope();
  const navigate = useAppNavigate();
  const projectHandle = hasComponent(scope) ? scope.project : '';
  const componentHandle = hasComponent(scope) ? scope.component : '';
  const { projectId } = useProjectId(projectHandle);
  const { data: component } = useComponentByHandler(projectId, componentHandle);
  const identity = useIntegrationIdentity(component);
  const { hasAnyPermission } = useAccessControl();

  const can = (perms: string[]) => hasAnyPermission(perms, projectId || undefined, component?.id);
  const visible = visibleComponentSettingsSections(identity, can);
  return <SettingsTabs active={active} sections={visible} onSelect={(path) => navigate(componentSettingsSectionUrl({ org: scope.org, project: projectHandle, component: componentHandle }, path))} />;
}
