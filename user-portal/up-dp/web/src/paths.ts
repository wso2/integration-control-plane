/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import type { IntegrationKind } from './types/portal';

/** Every in-app URL is built here; components never write route strings. */

export const KIND_SEGMENTS: Record<IntegrationKind, string> = { aiAgent: 'agents', automation: 'automations', workflow: 'workflows' };

export const overviewUrl = () => '/';
export const kindUrl = (kind: IntegrationKind) => `/${KIND_SEGMENTS[kind]}`;
export const tasksUrl = () => '/tasks';
export const integrationUrl = (id: string) => `/integrations/${encodeURIComponent(id)}`;

/** A workflow page with one run open in its drawer. A task knows only its workflow ID; the page finds the run. */
export const runUrl = (integrationId: string, workflowId: string, runId?: string) => {
  const query = new URLSearchParams({ workflow: workflowId });
  if (runId) query.set('run', runId);
  return `${integrationUrl(integrationId)}?${query}`;
};
