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

import type {
  DeploymentFrequencySummaryData,
  DeliveryGranularity,
  ChangeLeadTimeSummaryData,
  FailureRateSummaryData,
  RecoveryTimeSummaryData,
  DeploymentPoint,
  LeadTimePoint,
  FailureRatePoint,
  RecoveryTimePoint,
  ProjectPerformance,
  DeliveryInsightsRaw,
  DeliveryConfigurations,
  DeliveryDataPlane,
} from '../types/delivery';

/**
 * Delivery (DORA) insights + incident-source configuration.
 *
 * The OpenChoreo BFF exposes no delivery/DORA surface — these live on Devant's
 * platform gateway as the CIO query API and incident configurator. Until the
 * BFF closes that gap, every function throws via ni() so an unsupported
 * metric read or config write can never be mistaken for a successful one.
 *
 * awaits: cio-query-api (DORA metrics) / cio-incident-configurator (config)
 */

// TODO: implement using cloud APIs
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] delivery.${name}: not implemented`));

// DORA metrics (cio-query-api)
export const fetchDeploymentFrequencySummary = (_from: string, _to: string, _granularity: DeliveryGranularity, _projectId?: string): Promise<DeploymentFrequencySummaryData | null> => ni('fetchDeploymentFrequencySummary');
export const fetchChangeLeadTimeSummary = (_from: string, _to: string, _projectId?: string): Promise<ChangeLeadTimeSummaryData | null> => ni('fetchChangeLeadTimeSummary');
export const fetchFailureRateSummary = (_from: string, _to: string, _projectId?: string): Promise<FailureRateSummaryData | null> => ni('fetchFailureRateSummary');
export const fetchRecoveryTimeSummary = (_from: string, _to: string, _projectId?: string): Promise<RecoveryTimeSummaryData | null> => ni('fetchRecoveryTimeSummary');
export const fetchDeployments = (_from: string, _to: string, _granularity: DeliveryGranularity, _projectId?: string): Promise<DeploymentPoint[]> => ni('fetchDeployments');
export const fetchChangeLeadTimes = (_from: string, _to: string, _granularity: DeliveryGranularity, _projectId?: string): Promise<LeadTimePoint[]> => ni('fetchChangeLeadTimes');
export const fetchFailureRates = (_from: string, _to: string, _granularity: DeliveryGranularity, _projectId?: string): Promise<FailureRatePoint[]> => ni('fetchFailureRates');
export const fetchRecoveryTimes = (_from: string, _to: string, _granularity: DeliveryGranularity, _projectId?: string): Promise<RecoveryTimePoint[]> => ni('fetchRecoveryTimes');
export const fetchTopPerformingProjects = (_from: string, _to: string): Promise<ProjectPerformance[]> => ni('fetchTopPerformingProjects');
export const fetchDeliveryInsights = (_from: string, _to: string, _granularity: DeliveryGranularity, _configured: boolean, _projectId?: string): Promise<DeliveryInsightsRaw> => ni('fetchDeliveryInsights');

// Incident-source configuration (cio-incident-configurator)
export const fetchDeliveryConfigurations = (_orgUuid: string): Promise<DeliveryConfigurations | null> => ni('fetchDeliveryConfigurations');
export const fetchDeliveryDataPlanes = (_orgUuid: string): Promise<DeliveryDataPlane[]> => ni('fetchDeliveryDataPlanes');
export const addDeliveryConfiguration = (_orgUuid: string, _dataPlaneId: string, _selectorCriteria: string, _rejectorCriteria: string): Promise<void> => ni('addDeliveryConfiguration');
export const updateDeliverySelectorCriteria = (_orgUuid: string, _selectorCriteria: string): Promise<void> => ni('updateDeliverySelectorCriteria');
export const updateDeliveryRejectorCriteria = (_orgUuid: string, _rejectorCriteria: string): Promise<void> => ni('updateDeliveryRejectorCriteria');
