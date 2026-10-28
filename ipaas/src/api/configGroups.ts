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

// Config Groups: the list endpoint no-ops to empty on cloud so the read-only listing
// page renders; the remaining get/create/update/delete functions stay ni() stubs
// until the BFF exposes them.
import type { ConfigGroup, ConfigGroupNameAvailability, ConfigGroupUsage, CreateConfigGroupRequest, EditConfigGroupRequest } from '../types/configGroups';

const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] configGroups.${name}: not implemented`));

// awaits: config groups list endpoint. Empty default keeps the read-only listing
// page rendering (with an empty state) instead of throwing on cloud.
export const listConfigGroups = (): Promise<ConfigGroup[]> => Promise.resolve([]);
export const getConfigGroup = (_groupUuid: string): Promise<ConfigGroup> => ni('getConfigGroup');
export const checkConfigGroupName = (_candidateGroupName: string): Promise<ConfigGroupNameAvailability> => ni('checkConfigGroupName');
export const createConfigGroup = (_request: CreateConfigGroupRequest): Promise<ConfigGroup> => ni('createConfigGroup');
export const updateConfigGroup = (_request: EditConfigGroupRequest): Promise<ConfigGroup> => ni('updateConfigGroup');
export const deleteConfigGroup = (_groupUuid: string): Promise<void> => ni('deleteConfigGroup');
export const getConfigGroupUsage = (_configGroupId: string): Promise<ConfigGroupUsage> => ni('getConfigGroupUsage');
