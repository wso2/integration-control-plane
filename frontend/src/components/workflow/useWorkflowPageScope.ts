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

import { useComponentByHandler, useComponents, useEnvironments, useProjectByHandler, type GqlEnvironment } from '../../api/queries';
import { useWorkflowTaskQueues, type WorkflowTarget } from '../../api/workflows';
import { Permissions } from '../../constants/permissions';
import { isWorkflowIntegration } from '../../constants/integrationTypes';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { useLoadComponentPermissions, useLoadProjectPermissions } from '../../hooks/usePermissionLoader';
import { hasComponent, type ComponentScope, type ProjectScope } from '../../nav';

export interface WorkflowIntegrationEntry {
  componentId: string;
  name: string;
  // The route URL handler — distinct from the task queue that overwrites `handler` on WorkflowTarget.
  routeHandler: string;
  workflow: boolean;
}

export interface WorkflowPageScope {
  integrations: WorkflowIntegrationEntry[];
  workflowIntegrations: WorkflowIntegrationEntry[];
  soleWorkflowIntegration?: WorkflowIntegrationEntry;
  componentLevel: boolean;
  project: ReturnType<typeof useProjectByHandler>['data'];
  component: ReturnType<typeof useComponentByHandler>['data'];
  projectId: string;
  componentId: string;
  environments: GqlEnvironment[];
  activeEnvId: string;
  targets: WorkflowTarget[];
  taskQueue?: string;
  loading: boolean;
  canViewHumanTasks: boolean;
  canViewWorkflows: boolean;
}

export function useWorkflowPageScope(scope: ComponentScope | ProjectScope, selectedEnvId: string): WorkflowPageScope {
  const componentLevel = hasComponent(scope);
  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.project);
  const projectId = project?.id ?? '';
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, componentLevel ? scope.component : undefined);
  const { data: allComponents = [], isLoading: loadingComponents } = useComponents(scope.org, projectId);
  const { data: environments = [], isLoading: loadingEnvs } = useEnvironments(projectId);
  const componentId = component?.id ?? '';
  const activeEnvId = environments.some((e) => e.id === selectedEnvId) ? selectedEnvId : (environments[0]?.id ?? '');

  useLoadComponentPermissions(scope.org, projectId, componentLevel ? componentId : '');
  useLoadProjectPermissions(scope.org, projectId);
  const { hasAnyPermission } = useAccessControl();

  // Workflow-typed integrations sort first so targets[0], the gateway every read goes through, hosts a workflow engine.
  const baseTargets: WorkflowTarget[] = componentLevel
    ? component
      ? [{ componentId: component.id, componentName: component.displayName ?? component.name, handler: component.handler }]
      : []
    : [...allComponents].sort((a, b) => Number(isWorkflowIntegration(b.displayType)) - Number(isWorkflowIntegration(a.displayType))).map((c) => ({ componentId: c.id, componentName: c.displayName ?? c.name, handler: c.handler }));

  // The published queues, fetched once through the gateway (the endpoint answers for the whole project).
  const gatewayComponentId = baseTargets[0]?.componentId ?? '';
  const { data: queues = {} } = useWorkflowTaskQueues({ componentId: gatewayComponentId, environmentId: activeEnvId });
  const targets = baseTargets.map((t) => ({ ...t, handler: queues[t.componentId] ?? t.handler }));

  // Typed as a workflow integration, or a runtime of it published a task queue: management is per runtime.
  const integrations = allComponents.map((c) => ({
    componentId: c.id,
    name: c.displayName ?? c.name,
    routeHandler: c.handler,
    workflow: isWorkflowIntegration(c.displayType) || c.id in queues,
  }));
  const workflowIntegrations = integrations.filter((i) => i.workflow);

  const soleWorkflowIntegration = !componentLevel && workflowIntegrations.length === 1 ? workflowIntegrations[0] : undefined;

  // Undefined until the queue is published: filtering by the fallback handler name would silently return nothing.
  const taskQueue = componentLevel ? queues[componentId] : soleWorkflowIntegration ? queues[soleWorkflowIntegration.componentId] : undefined;

  const permScope = componentLevel ? componentId : undefined;
  const canViewHumanTasks = hasAnyPermission([Permissions.WORKFLOW_VIEW_HUMAN_TASKS, Permissions.WORKFLOW_MANAGE_HUMAN_TASKS], projectId, permScope);
  const canViewWorkflows = hasAnyPermission([Permissions.WORKFLOW_VIEW_WORKFLOWS, Permissions.WORKFLOW_MANAGE_WORKFLOWS], projectId, permScope);

  const effectiveTargets = soleWorkflowIntegration ? targets.filter((t) => t.componentId === soleWorkflowIntegration.componentId) : targets;

  return {
    integrations,
    workflowIntegrations,
    soleWorkflowIntegration,
    componentLevel,
    project,
    component,
    projectId,
    componentId,
    environments,
    activeEnvId,
    targets: effectiveTargets,
    taskQueue,
    loading: loadingProject || loadingComponent || loadingEnvs || loadingComponents,
    canViewHumanTasks,
    canViewWorkflows,
  };
}
