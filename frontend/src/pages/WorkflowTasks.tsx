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

import { useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import NotFound from '../components/NotFound';
import ProjectWorkflowDashboard from '../components/workflow/ProjectWorkflowDashboard';
import UserPortal from '../components/workflow/UserPortal';
import WorkflowPageFrame from '../components/workflow/WorkflowPageFrame';
import { useWorkflowPageScope } from '../components/workflow/useWorkflowPageScope';
import { resourceUrl, broaden, hasComponent, type ComponentScope, type ProjectScope } from '../nav';

// The person's own workflow work: human tasks for their roles and review activities awaiting their decision.
export default function WorkflowTasks(scope: ComponentScope | ProjectScope): JSX.Element {
  const componentLevel = hasComponent(scope);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEnvId, setSelectedEnvId] = useState(searchParams.get('env') ?? '');

  const pageScope = useWorkflowPageScope(scope, selectedEnvId);
  const { environments, activeEnvId, targets, taskQueue, component, project, canViewHumanTasks, canViewWorkflows, workflowIntegrations, soleWorkflowIntegration } = pageScope;
  // The project level is a dashboard that selects an integration unless there is exactly one workflow integration.
  const dashboard = !componentLevel && !soleWorkflowIntegration;

  // One queue holds both kinds of work; an old ?tab=reviews link presets the type filter.
  const initialKind = searchParams.get('tab') === 'reviews' ? ('reviews' as const) : undefined;
  void setSearchParams;
  const permitted = canViewHumanTasks || canViewWorkflows;

  if (!pageScope.loading && componentLevel && !component) {
    return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }

  return (
    <WorkflowPageFrame
      title="Human Tasks"
      description={
        componentLevel ? (
          <>
            Complete human tasks — including review activities — for <strong>{component?.displayName ?? scope.component}</strong>. Only tasks applicable to you are shown.
          </>
        ) : (
          <>
            {dashboard ? (
              <>
                Your human tasks in <strong>{project?.name ?? scope.project}</strong>, from every integration in the environment, in one queue.
              </>
            ) : (
              <>
                Complete human tasks — including review activities — for <strong>{soleWorkflowIntegration?.name ?? project?.name ?? scope.project}</strong>. Only tasks applicable to you are shown.
              </>
            )}
          </>
        )
      }
      loading={pageScope.loading}
      environments={environments}
      activeEnvId={activeEnvId}
      onEnvChange={setSelectedEnvId}
      permitted={permitted}
      noPermissionMessage={componentLevel ? 'You do not have permission to view tasks for this integration.' : 'You do not have permission to view tasks for this project.'}>
      {permitted &&
        (dashboard ? (
          <ProjectWorkflowDashboard scope={scope as ProjectScope} projectId={pageScope.projectId} environmentId={activeEnvId} integrations={workflowIntegrations} resource="tasks" canViewHumanTasks={canViewHumanTasks} canViewWorkflows={canViewWorkflows} />
        ) : (
          <UserPortal
            targets={targets}
            environmentId={activeEnvId}
            taskQueue={taskQueue}
            canViewTasks={canViewHumanTasks}
            canViewReviews={canViewHumanTasks || canViewWorkflows}
            initialKind={initialKind}
            initialTaskId={searchParams.get('task') ?? undefined}
            initialReviewId={searchParams.get('review') ?? undefined}
          />
        ))}
    </WorkflowPageFrame>
  );
}
