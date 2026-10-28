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

import type { AlertRuleCountUsage, AlertRule, AlertHistoryResponse } from '../types/alerts';
import type { AlertComponentType } from '../constants/alerts';

// TODO: implement using cloud APIs
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] alerts.${name}: not implemented`));

export const getAlertRulesCount = (_baseUrl: string, _componentId: string, _environmentId: string, _componentType: AlertComponentType): Promise<AlertRuleCountUsage> => ni('getAlertRulesCount');
export const getAlertRules = (_baseUrl: string, _componentId: string, _environmentId: string, _componentType: AlertComponentType): Promise<AlertRule[]> => ni('getAlertRules');
export const createAlertRule = (_baseUrl: string, _alertRule: AlertRule): Promise<void> => ni('createAlertRule');
export const updateAlertRule = (_baseUrl: string, _alertRule: AlertRule): Promise<void> => ni('updateAlertRule');
export const deleteAlertRule = (_baseUrl: string, _alertRule: AlertRule): Promise<void> => ni('deleteAlertRule');
export const getAlertHistory = (_baseUrl: string, _componentId: string, _environmentId: string, _startTime: string, _endTime: string, _limit?: number, _versionIdList?: string[], _alertTypes?: string[], _searchPhrase?: string): Promise<AlertHistoryResponse> =>
  ni('getAlertHistory');
