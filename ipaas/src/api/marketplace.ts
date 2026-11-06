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

import type { ThrottlingPolicy, ApiDocument, RuleAdherenceResponse } from '../types/marketplace';

// TODO: implement using cloud APIs
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] marketplace.${name}: not implemented`));

export const fetchThrottlingPolicies = (): Promise<ThrottlingPolicy[]> => ni('fetchThrottlingPolicies');
export const fetchApiDocuments = (_apimId: string): Promise<ApiDocument[]> => ni('fetchApiDocuments');
export const fetchRuleAdherence = (_projectId: string, _componentId: string, _apimId: string): Promise<RuleAdherenceResponse | null> => ni('fetchRuleAdherence');
