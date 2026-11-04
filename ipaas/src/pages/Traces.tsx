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
import { useComponentByHandler } from '../hooks/useComponents';
import { useProjectId } from '../hooks/useProjects';
import { hasIntegrationTraces } from '../utils/integrationTraces';
import TracesPageSkeleton from '../components/IntegrationTraces/TracesSkeletons';
import AgentTraces from './AgentTraces';
import IntegrationTraces from './IntegrationTraces';
import type { ComponentScope } from '../nav';

/**
 * One Traces route for two sources: Ballerina integrations' traces come from the observability
 * plane, agents' from Agent Manager. AgentTraces covers every other integration, and a missing one.
 */
export default function Traces(scope: ComponentScope): JSX.Element {
  const { projectId, isLoading: loadingProject } = useProjectId(scope.project);
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  if (loadingProject || loadingComponent) return <TracesPageSkeleton />;
  return component && hasIntegrationTraces(component) ? <IntegrationTraces {...scope} /> : <AgentTraces {...scope} />;
}
