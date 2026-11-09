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
import UserPortalPrompt from '../components/UserPortal/UserPortalPrompt';
import { CALLS_CARRY_ROLES, humanTasksComingSoon } from '../components/Workflows/connection/workflowCredential';
import { useUserPortalServed } from '../hooks/useUserPortal';
import WorkflowPageShell, { type WorkflowPagePlaceholderProps } from '../components/Workflows/shared/WorkflowPageShell';
import HumanTasksPage from '../components/Workflows/tasks/HumanTasksPage';
import type { ComponentScope } from '../nav';
import { ComingSoonInline } from './ComingSoon';

/**
 * Human tasks as the console can't serve them yet, for the environment shown, with the way to them in the User
 * Portal there: enable it, publish the workflow to it, or open it.
 */
function HumanTasksComingSoon({ component, environment }: WorkflowPagePlaceholderProps): JSX.Element {
  const portalServed = useUserPortalServed(environment.id);
  return <ComingSoonInline description={humanTasksComingSoon(portalServed)} action={portalServed && <UserPortalPrompt componentId={component.id} environment={environment} />} />;
}

/** The work queue of a workflow integration, under Operate at `.../human-tasks`: everything waiting on a person. */
export default function ComponentHumanTasks(scope: ComponentScope): JSX.Element {
  // The engine serves the tasks a role is named for only to a caller with roles (CALLS_CARRY_ROLES).
  // The User Portal calls with its users' tokens, which carry them, so it serves these tasks already.
  return (
    <WorkflowPageShell scope={scope} title="Human Tasks" purpose="workOnTasks" placeholder={CALLS_CARRY_ROLES ? undefined : (slot) => <HumanTasksComingSoon {...slot} />}>
      {/* Keyed on the connection: an item open or selected in one environment's queue is not another's. */}
      {(slot) => <HumanTasksPage key={slot.api.connection.scopeId} {...slot} />}
    </WorkflowPageShell>
  );
}
