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

import type { HealthCheck, HealthCheckWriteData } from '../../types/healthChecks';

// Intentionally a stub (the standard icp-stub contract — see src/api/AGENTS.md).
const ni = (name: string): never => {
  throw new Error(`[icp] healthChecks.${name}: not implemented`);
};

export const getHealthChecks = (_orgUuid: string, _projectId: string, _componentId: string, _releaseId: string, _environmentId: string): Promise<HealthCheck[]> => ni('getHealthChecks');
export const createHealthCheck = (_orgUuid: string, _projectId: string, _componentId: string, _releaseId: string, _environmentId: string, _containerId: string, _data: HealthCheckWriteData): Promise<HealthCheck> => ni('createHealthCheck');
export const updateHealthCheck = (_orgUuid: string, _projectId: string, _componentId: string, _releaseId: string, _environmentId: string, _containerId: string, _healthCheckId: string, _data: HealthCheckWriteData): Promise<HealthCheck> =>
  ni('updateHealthCheck');
export const deleteHealthCheck = (_orgUuid: string, _projectId: string, _componentId: string, _releaseId: string, _environmentId: string, _containerId: string, _healthCheckId: string): Promise<void> => ni('deleteHealthCheck');
