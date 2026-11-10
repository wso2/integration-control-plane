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
 * A workflow's Management API is listed with its other endpoints, and its security, API settings and visibility can
 * be changed, for a team that shares it through the Developer Portal or calls it from its own applications. The
 * console's workflow pages and the User Portal call it as well, so each place that changes it says so first.
 */
const MANAGEMENT_API_CALLERS =
  'This is the workflow’s Workflow Management API. The console’s workflow pages and human tasks call it with an API key, and the User Portal calls it with its users’ sign-ins while the workflow is published there.';

/** Said before the Management API's security is changed. */
export const MANAGEMENT_API_SECURITY_WARNING = `${MANAGEMENT_API_CALLERS} Changing its security can stop them working: the console takes only API key security, and the User Portal only OAuth.`;

/** Said before the Management API's CORS or rate limits are changed. */
export const MANAGEMENT_API_SETTINGS_WARNING = `${MANAGEMENT_API_CALLERS} A rate limit applies to their calls too, and both poll it. Its CORS allows every origin, for the User Portal, and every deploy sets that again, so it can’t be changed.`;

/** Said before the Management API's network visibility is changed. */
export const MANAGEMENT_API_VISIBILITY_WARNING = `${MANAGEMENT_API_CALLERS} Changing its visibility can stop them reaching it: the User Portal calls it only on the public host.`;
