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

import type { EnvEndpoint } from '../../../types/component';
import { isWorkflowManagementEndpoint } from '../../../utils/workflowIntegration';

/**
 * Finds the endpoint the workflow Management API is served from.
 *
 * The workflow module describes its management service in an OpenAPI spec titled
 * "Workflow Management API", and the platform lists the service among the release's endpoints
 * under that title as its display name (on a live integration: `workflow-ma-cf1`, port 8234, base
 * path `/workflow`). Its name is not a reliable way to recognise it, because the platform derives
 * the name from the title plus a generated suffix.
 *
 * The console reaches the endpoint through the API Platform gateway: `useEndpointTestAccess` gives
 * its invoke URL (gateway host plus the API's context) and the test key. The gateway maps that URL
 * onto the endpoint's base path, so the client's paths go straight after it.
 */

export const NO_MANAGEMENT_ENDPOINT = 'This integration has no workflow management endpoint.';

export type WorkflowEndpointResolution = { status: 'ready'; endpoint: EnvEndpoint } | { status: 'unavailable'; reason: string };

/** The release's management endpoint. The platform lists only a release's live endpoints. */
export function resolveWorkflowEndpoint(endpoints: EnvEndpoint[]): WorkflowEndpointResolution {
  const endpoint = endpoints.find(isWorkflowManagementEndpoint);
  return endpoint ? { status: 'ready', endpoint } : { status: 'unavailable', reason: NO_MANAGEMENT_ENDPOINT };
}

/** The client's base URL from the endpoint's gateway URL: the same URL, without a trailing slash. */
export function resolveWorkflowBaseUrl(gatewayUrl: string): string {
  return gatewayUrl.replace(/\/+$/, '');
}
