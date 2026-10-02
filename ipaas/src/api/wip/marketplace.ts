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

import { getOrgUuidFromToken } from '#auth';
import { apimClient, choreoClient } from './httpClients';
import type { ApiDocument, RuleAdherenceResponse, ThrottlingPolicy } from '../../types/marketplace';

export async function fetchThrottlingPolicies(): Promise<ThrottlingPolicy[]> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  if (!orgUuid) return [];
  try {
    const data = await apimClient.get<{ list?: ThrottlingPolicy[] }>(`/api/am/publisher/v2/throttling-policies/subscription?organizationId=${encodeURIComponent(orgUuid)}`);
    return data.list ?? [];
  } catch {
    return [];
  }
}

export async function fetchApiDocuments(apimId: string): Promise<ApiDocument[]> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  if (!orgUuid || !apimId) return [];
  try {
    const data = await apimClient.get<{ list?: ApiDocument[] }>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents?organizationId=${encodeURIComponent(orgUuid)}`);
    return data.list ?? [];
  } catch {
    return [];
  }
}

export async function fetchRuleAdherence(projectId: string, componentId: string, apimId: string): Promise<RuleAdherenceResponse | null> {
  if (!projectId || !componentId || !apimId) return null;
  try {
    return await choreoClient.get<RuleAdherenceResponse>(`/governance/v1.0/projects/${encodeURIComponent(projectId)}/components/${encodeURIComponent(componentId)}/endpoints/${encodeURIComponent(apimId)}/rule-adherence`);
  } catch {
    return null;
  }
}
