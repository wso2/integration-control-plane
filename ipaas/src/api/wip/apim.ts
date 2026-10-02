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

import { authenticatedFetch, getOrgUuidFromToken } from '#auth';
import { apimClient, choreoClient } from './httpClients';
import type { ApimApiInfo, GeneratedTestKey, DeploySettingsV2Payload, LifecycleState, LifecycleHistory, MarketplaceService } from '../../types/apim';
import type { ApiDocument } from '../../types/marketplace';
import type { EnvEndpoint } from '../../types/component';

// ── Internal Marketplace (Overview) ──────────────────────────────────────────

async function getEndpointHash(endpoint: EnvEndpoint): Promise<string> {
  if (endpoint.signature) return endpoint.signature.substring(0, 5);
  if (!crypto?.subtle) throw new Error('SubtleCrypto unavailable: a secure context (HTTPS) is required');
  const raw = `${endpoint.port}|${endpoint.type}|${endpoint.apiContext}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const view = new DataView(digest);
  const hexes: string[] = [];
  for (let i = 0; i < view.byteLength; i += 4) {
    hexes.push(`00000000${view.getUint32(i).toString(16)}`.slice(-8));
  }
  return hexes.join('').substring(0, 5);
}

export async function fetchMarketplaceService(componentId: string, version: string, endpoint: EnvEndpoint): Promise<MarketplaceService | null> {
  const base = window.API_CONFIG.internalMarketplaceUrl;
  if (!base || !componentId || !version) return null;
  try {
    const epHash = await getEndpointHash(endpoint);
    const res = await authenticatedFetch(`${base}/services/choreo/components/${encodeURIComponent(componentId)}/versions/${encodeURIComponent(version)}/endpoints/${encodeURIComponent(epHash)}`);
    if (!res.ok) return null;
    return (await res.json()) as MarketplaceService;
  } catch {
    return null;
  }
}

export async function saveMarketplaceService(serviceId: string, service: MarketplaceService): Promise<void> {
  const base = window.API_CONFIG.internalMarketplaceUrl;
  if (!base) throw new Error('Marketplace URL is not configured');
  // The PUT endpoint accepts a closed ServiceRequest — only these fields are allowed.
  const body = {
    name: service.name,
    description: service.description,
    summary: service.summary,
    tags: service.tags ?? [],
    visibility: service.visibility ?? [],
    isThirdParty: service.isThirdParty ?? false,
    version: service.version,
    resourceType: service.resourceType ?? 'SERVICE',
    organizationId: service.organizationId,
    serviceType: service.serviceType,
    connectionSchemas: service.connectionSchemas,
    status: service.status,
  };
  const res = await authenticatedFetch(`${base}/services/${encodeURIComponent(serviceId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Failed to save marketplace service: ${res.status}`);
}

// ── APIM Documents (kept for compatibility) ────────────────────────────────────────────────────

const OVERVIEW_DOC_NAME = 'Overview';

export async function fetchApimOverview(apimId: string): Promise<string> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  const base = window.API_CONFIG.apimBaseUrl;
  try {
    const list = await apimClient.get<{ list?: { documentId: string; name: string; sourceType?: string }[] }>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents?organizationId=${encodeURIComponent(orgUuid)}`);
    const doc = list.list?.find((d) => d.name === OVERVIEW_DOC_NAME && (d.sourceType === 'INLINE' || d.sourceType === 'MARKDOWN'));
    if (!doc) return '';
    const res = await authenticatedFetch(`${base}/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents/${encodeURIComponent(doc.documentId)}/content?organizationId=${encodeURIComponent(orgUuid)}`);
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

export async function saveApimOverview(apimId: string, content: string): Promise<void> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  const base = window.API_CONFIG.apimBaseUrl;
  const qs = `?organizationId=${encodeURIComponent(orgUuid)}`;
  const list = await apimClient.get<{ list?: { documentId: string; name: string; sourceType?: string }[] }>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents${qs}`);
  let docId = list.list?.find((d) => d.name === OVERVIEW_DOC_NAME && (d.sourceType === 'INLINE' || d.sourceType === 'MARKDOWN'))?.documentId;
  if (!docId) {
    const created = await apimClient.post<{ documentId: string }>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents${qs}`, {
      name: OVERVIEW_DOC_NAME,
      type: 'OTHER',
      otherTypeName: OVERVIEW_DOC_NAME,
      sourceType: 'MARKDOWN',
      visibility: 'API_LEVEL',
      summary: ' ',
    });
    docId = created.documentId;
  }
  const form = new FormData();
  form.append('inlineContent', content);
  const res = await authenticatedFetch(`${base}/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents/${encodeURIComponent(docId)}/content${qs}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Failed to save overview: ${res.status}`);
}

export async function fetchApimThumbnail(apimId: string): Promise<string | null> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  try {
    const res = await authenticatedFetch(`${window.API_CONFIG.apimBaseUrl}/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/thumbnail?organizationId=${encodeURIComponent(orgUuid)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function saveApimThumbnail(apimId: string, file: File): Promise<void> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  const form = new FormData();
  form.append('file', file);
  const res = await authenticatedFetch(`${window.API_CONFIG.apimBaseUrl}/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/thumbnail?organizationId=${encodeURIComponent(orgUuid)}`, { method: 'PUT', body: form });
  if (!res.ok) throw new Error(`Failed to upload thumbnail: ${res.status}`);
}

export async function fetchApimApi(apimId: string): Promise<ApimApiInfo | null> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  try {
    return await apimClient.get<ApimApiInfo>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}?organizationId=${encodeURIComponent(orgUuid)}`);
  } catch {
    return null;
  }
}

export async function updateApimApi(apimId: string, body: ApimApiInfo): Promise<ApimApiInfo> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  try {
    return await apimClient.put<ApimApiInfo>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}?organizationId=${encodeURIComponent(orgUuid)}`, body);
  } catch (err) {
    throw new Error(`APIM update failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function deleteApimApi(apimId: string): Promise<void> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  await apimClient.delete<void>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}?organizationId=${encodeURIComponent(orgUuid)}`);
}

export async function generateTestKey(apimId: string, keyType: 'Development' | 'Production'): Promise<GeneratedTestKey | null> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  try {
    const params = new URLSearchParams({ organizationId: orgUuid, keyType });
    return await apimClient.post<GeneratedTestKey>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/generate-key?${params}`);
  } catch {
    return null;
  }
}

export async function deploySettingsV2(componentId: string, versionId: string, payload: DeploySettingsV2Payload): Promise<void> {
  try {
    await choreoClient.post(`/proxy/deployer/v1/components/${encodeURIComponent(componentId)}/versions/${encodeURIComponent(versionId)}/deploy-settings-v2`, payload);
  } catch (err) {
    throw new Error(`deploy-settings-v2 failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export async function fetchLifecycleState(apimId: string): Promise<LifecycleState | null> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  try {
    return await apimClient.get<LifecycleState>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/lifecycle-state?organizationId=${encodeURIComponent(orgUuid)}`);
  } catch {
    return null;
  }
}

export async function fetchLifecycleHistory(apimId: string): Promise<LifecycleHistory | null> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  try {
    return await apimClient.get<LifecycleHistory>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/lifecycle-history?organizationId=${encodeURIComponent(orgUuid)}`);
  } catch {
    return null;
  }
}

export async function changeLifecycleState(apimId: string, action: string): Promise<LifecycleState> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  const params = new URLSearchParams({ organizationId: orgUuid, apiId: apimId, action });
  const data = await apimClient.post<{ lifecycleState: LifecycleState }>(`/api/am/publisher/v2/apis/change-lifecycle?${params}`);
  return data.lifecycleState;
}

// ── APIM Developer Documents ─────────────────────────────────────────────────

export async function fetchApimDocuments(apimId: string): Promise<ApiDocument[]> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  try {
    const data = await apimClient.get<{ list?: ApiDocument[] }>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents?organizationId=${encodeURIComponent(orgUuid)}`);
    return data.list ?? [];
  } catch {
    return [];
  }
}

export async function fetchApimDocumentContent(apimId: string, docId: string): Promise<string> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  try {
    const res = await authenticatedFetch(`${window.API_CONFIG.apimBaseUrl}/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents/${encodeURIComponent(docId)}/content?organizationId=${encodeURIComponent(orgUuid)}`);
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

async function uploadDocumentContent(apimId: string, docId: string, content: string): Promise<void> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  const form = new FormData();
  form.append('inlineContent', content);
  const res = await authenticatedFetch(`${window.API_CONFIG.apimBaseUrl}/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents/${encodeURIComponent(docId)}/content?organizationId=${encodeURIComponent(orgUuid)}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Failed to save document content: ${res.status}`);
}

export async function createApimDocument(apimId: string, doc: Omit<ApiDocument, 'documentId'>, content: string): Promise<ApiDocument> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  const created = await apimClient.post<ApiDocument>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents?organizationId=${encodeURIComponent(orgUuid)}`, doc);
  if ((doc.sourceType === 'MARKDOWN' || doc.sourceType === 'INLINE') && content) {
    await uploadDocumentContent(apimId, created.documentId, content);
  }
  return created;
}

export async function updateApimDocument(apimId: string, docId: string, doc: ApiDocument, content?: string): Promise<ApiDocument> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  const updated = await apimClient.put<ApiDocument>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents/${encodeURIComponent(docId)}?organizationId=${encodeURIComponent(orgUuid)}`, doc);
  if ((doc.sourceType === 'MARKDOWN' || doc.sourceType === 'INLINE') && content !== undefined) {
    await uploadDocumentContent(apimId, docId, content);
  }
  return updated;
}

export async function deleteApimDocument(apimId: string, docId: string): Promise<void> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  await apimClient.delete<void>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimId)}/documents/${encodeURIComponent(docId)}?organizationId=${encodeURIComponent(orgUuid)}`);
}

// ── APIM Swagger ───────────────────────────────────────────────────────────────

export async function fetchApimSwagger(apimRevisionId: string): Promise<unknown> {
  const orgUuid = getOrgUuidFromToken() ?? '';
  try {
    return await apimClient.get<unknown>(`/api/am/publisher/v2/apis/${encodeURIComponent(apimRevisionId)}/swagger?organizationId=${encodeURIComponent(orgUuid)}`);
  } catch {
    return null;
  }
}
