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

import { useEffect, useState, type JSX } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Alert, Snackbar } from '@wso2/oxygen-ui';
import NotFound from '../components/NotFound';
import ProjectWorkflowDashboard from '../components/workflow/ProjectWorkflowDashboard';
import AdminPortal from '../components/workflow/AdminPortal';
import WorkflowPageFrame from '../components/workflow/WorkflowPageFrame';
import { useWorkflowPageScope } from '../components/workflow/useWorkflowPageScope';
import { gatewayScope } from '../components/workflow/helpers';
import { valueOf, useWorkflowInfo } from '../api/workflows';
import { resourceUrl, broaden, hasComponent, type ComponentScope, type ProjectScope } from '../nav';

// Workflow executions: the operator's view of what ran and is running.
export default function Workflows(scope: ComponentScope | ProjectScope): JSX.Element {
  const componentLevel = hasComponent(scope);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEnvId, setSelectedEnvId] = useState(searchParams.get('env') ?? '');

  // A page navigating here can pass one toast in router state; it is read once, so a refresh does not replay it.
  const location = useLocation();
  const [arrivalToast, setArrivalToast] = useState<string | null>(() => {
    const state = location.state as { toast?: string } | null;
    return typeof state?.toast === 'string' ? state.toast : null;
  });

  const [deepLink, setDeepLink] = useState<{ workflowType?: string; workflowId?: string }>(() => ({
    workflowType: searchParams.get('type') ?? undefined,
    workflowId: searchParams.get('workflowId') ?? undefined,
  }));
  const urlWorkflowType = searchParams.get('type');
  const urlWorkflowId = searchParams.get('workflowId');
  // A deep link can also arrive without remounting this page — "View Instance" from the start
  // dialog navigates to these same params — so pick those up when they appear.
  useEffect(() => {
    if (urlWorkflowType === null && urlWorkflowId === null) return;
    setDeepLink({ workflowType: urlWorkflowType ?? undefined, workflowId: urlWorkflowId ?? undefined });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('type');
        next.delete('workflowId');
        return next;
      },
      { replace: true },
    );
  }, [urlWorkflowType, urlWorkflowId, setSearchParams]);

  const pageScope = useWorkflowPageScope(scope, selectedEnvId);
  const { environments, activeEnvId, targets, taskQueue, component, project, workflowIntegrations, soleWorkflowIntegration, canViewHumanTasks, canViewWorkflows } = pageScope;
  // Same rule as the tasks page: the project level is a dashboard unless there is exactly one workflow integration.
  const dashboard = !componentLevel && !soleWorkflowIntegration;

  // A deep-linked id might not be a workflow at all — a human task and a review are their own instances.
  const gatewayForResolve = gatewayScope({ targets, environmentId: activeEnvId });
  const { data: linkedInfo } = useWorkflowInfo(gatewayForResolve, deepLink.workflowId ?? null);
  const navigate = useNavigate();
  useEffect(() => {
    const kind = (valueOf(linkedInfo)?.kind ?? '').toUpperCase();
    if (!deepLink.workflowId || (kind !== 'HUMAN_TASK' && kind !== 'REVIEW_ACTIVITY')) return;
    const params = new URLSearchParams(kind === 'HUMAN_TASK' ? { tab: 'tasks', task: deepLink.workflowId } : { tab: 'reviews', review: deepLink.workflowId });
    if (activeEnvId) params.set('env', activeEnvId);
    navigate(`${resourceUrl(scope, 'tasks')}?${params}`, { replace: true });
  }, [linkedInfo, deepLink.workflowId, activeEnvId, navigate, scope]);

  const requestedTab = searchParams.get('tab');
  if (requestedTab === 'tasks' || requestedTab === 'reviews') {
    const params = new URLSearchParams({ tab: requestedTab });
    if (activeEnvId) params.set('env', activeEnvId);
    return <Navigate to={`${resourceUrl(scope, 'tasks')}?${params}`} replace />;
  }

  if (!pageScope.loading && componentLevel && !component) {
    return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }

  // Remounts the portal when the deep link changes, so a new one re-seeds the filters.
  const deepLinkKey = `${deepLink.workflowType ?? ''}:${deepLink.workflowId ?? ''}`;

  return (
    <WorkflowPageFrame
      title="Workflow Executions"
      description={
        componentLevel ? (
          <>
            Start, inspect and manage workflow executions of <strong>{component?.displayName ?? scope.component}</strong>.
          </>
        ) : (
          <>
            {dashboard ? (
              <>
                Workflow executions in <strong>{project?.name ?? scope.project}</strong>, integration by integration.
              </>
            ) : (
              <>
                Start, inspect and manage workflow executions of <strong>{soleWorkflowIntegration?.name ?? project?.name ?? scope.project}</strong>.
              </>
            )}
          </>
        )
      }
      loading={pageScope.loading}
      environments={environments}
      activeEnvId={activeEnvId}
      onEnvChange={setSelectedEnvId}
      permitted={pageScope.canViewWorkflows}
      noPermissionMessage={componentLevel ? 'You do not have permission to view workflow executions for this integration.' : 'You do not have permission to view workflow executions for this project.'}>
      {dashboard ? (
        <ProjectWorkflowDashboard scope={scope as ProjectScope} projectId={pageScope.projectId} environmentId={activeEnvId} integrations={workflowIntegrations} resource="workflows" canViewHumanTasks={canViewHumanTasks} canViewWorkflows={canViewWorkflows} />
      ) : (
        <AdminPortal key={deepLinkKey} targets={targets} environmentId={activeEnvId} taskQueue={taskQueue} initialWorkflowType={deepLink.workflowType} initialWorkflowId={deepLink.workflowId} />
      )}
      <Snackbar open={arrivalToast !== null} autoHideDuration={6000} onClose={() => setArrivalToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {arrivalToast ? (
          <Alert severity="success" onClose={() => setArrivalToast(null)} sx={{ width: '100%' }}>
            {arrivalToast}
          </Alert>
        ) : undefined}
      </Snackbar>
    </WorkflowPageFrame>
  );
}
