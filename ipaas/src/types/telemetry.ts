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

/** A dimension value the service accepts: it drops objects and arrays. */
export type ConsoleActionDimensionValue = string | number | boolean;

/** One console action as `POST /telemetry/console-actions` takes it. */
export interface ConsoleActionPayload {
  /** `integration-platform.console.<group>.<action>`, declared in ipaas-service's growth/console_actions.yaml. */
  action: string;
  /** ISO 8601, from the browser clock. */
  occurredAt: string;
  /** Route template, e.g. `/organizations/:orgHandler/projects/:projectHandler`. Never a concrete path. */
  page: string;
  /** Opaque per-tab id that groups one session's actions. */
  sessionId: string;
  dimensions?: Record<string, ConsoleActionDimensionValue>;
}

/**
 * The activation-funnel operations a mutation can name in `meta.operation`. A failure is reported as the console
 * action friction.error-shown, and a success completes a create flow's abandonment tracking.
 */
export type FunnelOperation = 'create-project' | 'create-integration' | 'build-integration' | 'deploy-integration' | 'promote-integration';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { operation?: FunnelOperation };
  }
}
