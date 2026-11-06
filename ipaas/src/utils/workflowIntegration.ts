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

import type { Component, EnvEndpoint } from '../types/component';
import { identifyIntegration } from './identifyIntegration';

/**
 * The `info.title` of the workflow module's management spec, which the platform keeps as the
 * endpoint's display name. The endpoint's name carries a generated suffix, so it is no way to tell.
 */
export const WORKFLOW_MANAGEMENT_API_TITLE = 'Workflow Management API';

/** Whether a component is a workflow integration, as the nav and the Deploy page tell. */
export function isWorkflowIntegration(component: Pick<Component, 'displayType' | 'componentSubType'> | null | undefined): boolean {
  return !!component && identifyIntegration(component.displayType ?? '', component.componentSubType ?? null).type === 'workflow';
}

/** Whether an endpoint is the platform's management API rather than a business endpoint. */
export function isWorkflowManagementEndpoint(endpoint: Pick<EnvEndpoint, 'displayName'>): boolean {
  return (endpoint.displayName || '').trim().toLowerCase() === WORKFLOW_MANAGEMENT_API_TITLE.toLowerCase();
}

/**
 * Whether an endpoint is one the person works with. A workflow integration's
 * "Workflow Management API" is the platform's own: the console calls it for the
 * Workflows and Human Tasks pages and the workflow Overview card, and nobody tests,
 * configures or shares it, so workflow integrations leave it out of their endpoint
 * lists. Other integrations list every endpoint.
 */
export function isUserVisibleEndpoint(endpoint: Pick<EnvEndpoint, 'displayName'>, isWorkflow: boolean): boolean {
  return !(isWorkflow && isWorkflowManagementEndpoint(endpoint));
}
