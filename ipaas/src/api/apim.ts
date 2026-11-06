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

/**
 * Cloud (OpenChoreo) APIM surface.
 *
 * OpenChoreo has no API Manager, so the API/lifecycle/test-key functions return
 * safe defaults — their consumers are gated on IS_DEVANT and never call them in
 * cloud builds. The one function that matters is fetchApimSwagger: the cloud env
 * card carries each endpoint's base64 OpenAPI (from the BFF api-resources) in the
 * `apimRevisionId` slot, so here we decode + parse it into the document object
 * the swagger view expects (instead of fetching a revision from APIM).
 */

import { parse as parseYaml } from 'yaml';
import type { ApimApiInfo, GeneratedTestKey, DeploySettingsV2Payload, LifecycleState, LifecycleHistory, MarketplaceService } from '../types/apim';
import type { EnvEndpoint } from '../types/component';
import type { ApiDocument } from '../types/marketplace';

export async function fetchApimApi(_apimId: string): Promise<ApimApiInfo | null> {
  return null;
}

export async function updateApimApi(_apimId: string, body: ApimApiInfo): Promise<ApimApiInfo> {
  return body;
}

export async function deleteApimApi(_apimId: string): Promise<void> {
  // No-op: cloud doesn't manage standalone APIM APIs.
}

export async function generateTestKey(_apimId: string, _keyType: 'Development' | 'Production'): Promise<GeneratedTestKey | null> {
  return null;
}

export async function deploySettingsV2(_componentId: string, _versionId: string, _payload: DeploySettingsV2Payload): Promise<void> {
  // No APIM in cloud — nothing to deploy.
}

export async function fetchLifecycleState(_apimId: string): Promise<LifecycleState | null> {
  return null;
}

export async function fetchLifecycleHistory(_apimId: string): Promise<LifecycleHistory | null> {
  return null;
}

export async function changeLifecycleState(_apimId: string, _action: string): Promise<LifecycleState> {
  throw new Error('Lifecycle management is not supported in this build.');
}

// Not wired to a cloud backend yet. These throw via ni() so callers can never
// mistake an unsupported read or save for a successful one.
// TODO: implement using cloud APIs
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] apim.${name}: not implemented`));

export const fetchApimOverview = (_apimId: string): Promise<string> => ni('fetchApimOverview');
export const saveApimOverview = (_apimId: string, _content: string): Promise<void> => ni('saveApimOverview');
export const fetchApimThumbnail = (_apimId: string): Promise<string | null> => ni('fetchApimThumbnail');
export const saveApimThumbnail = (_apimId: string, _file: File): Promise<void> => ni('saveApimThumbnail');
export const fetchMarketplaceService = (_componentId: string, _version: string, _endpoint: EnvEndpoint): Promise<MarketplaceService | null> => ni('fetchMarketplaceService');
export const saveMarketplaceService = (_serviceId: string, _service: MarketplaceService): Promise<void> => ni('saveMarketplaceService');

// API documentation lives in APIM's publisher store, which OpenChoreo has no
// equivalent for. The consumers are gated on IS_DEVANT and never reach these in
// cloud builds; they throw rather than fake a document so an unsupported call
// can never look successful.
export const fetchApimDocuments = (_apimId: string): Promise<ApiDocument[]> => ni('fetchApimDocuments');
export const fetchApimDocumentContent = (_apimId: string, _docId: string): Promise<string> => ni('fetchApimDocumentContent');
export const createApimDocument = (_apimId: string, _doc: Omit<ApiDocument, 'documentId'>, _content: string): Promise<ApiDocument> => ni('createApimDocument');
export const updateApimDocument = (_apimId: string, _docId: string, _doc: ApiDocument, _content?: string): Promise<ApiDocument> => ni('updateApimDocument');
export const deleteApimDocument = (_apimId: string, _docId: string): Promise<void> => ni('deleteApimDocument');

// schemaContent is the endpoint's base64-encoded OpenAPI (YAML or JSON), carried
// via the endpoint's apimRevisionId field by cloud fetchEnvEndpoints.
export async function fetchApimSwagger(schemaContent: string): Promise<unknown> {
  if (!schemaContent) return null;
  try {
    // atob yields a Latin-1 byte string; decode those bytes as UTF-8 so
    // non-ASCII characters in the OpenAPI document survive intact.
    const bytes = Uint8Array.from(atob(schemaContent), (ch) => ch.charCodeAt(0));
    return parseYaml(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
