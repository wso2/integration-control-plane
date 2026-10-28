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

import type { ComponentHttpMetricsPayload, ComponentUsageMetricsPayload, ProjectMetricsModel } from '../types/observability';

/**
 * Component / project observability metrics.
 *
 * The OpenChoreo BFF exposes no metrics surface — these live on Devant's obs
 * API (choreoobsapi) on the systemapis gateway. Until the BFF closes that gap,
 * the fetchers throw via ni() so an
 * unsupported metrics read can never be mistaken for "no data".
 *
 * awaits: choreoobsapi (component http/usage metrics, project metrics model)
 */

/** Bucket width the histograms are aggregated into: 1/100th of the range,
 * floored to whole minutes, min 1m. Pure helper — no backend dependency. */
export function metricsBreakSize(fromIso: string, toIso: string): string {
  const minutes = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000 / 100;
  return `${Math.max(Math.floor(minutes), 1)}m`;
}

// TODO: implement using cloud APIs
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] observability.${name}: not implemented`));

export const fetchComponentHttpMetrics = (_releaseId: string, _fromIso: string, _toIso: string): Promise<ComponentHttpMetricsPayload | null> => ni('fetchComponentHttpMetrics');
export const fetchComponentUsageMetrics = (_releaseId: string, _fromIso: string, _toIso: string): Promise<ComponentUsageMetricsPayload | null> => ni('fetchComponentUsageMetrics');
export const fetchProjectMetricsModel = (_projectId: string, _environmentId: string, _fromIso: string, _toIso: string): Promise<ProjectMetricsModel | null> => ni('fetchProjectMetricsModel');
