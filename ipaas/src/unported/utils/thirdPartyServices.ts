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
 * Pure helpers for the Third Party register flow. Builds the marketplace
 * `POST /services` payload from an uploaded definition + endpoints, reusing the
 * shared GenAI/marketplace helpers where the shapes are identical. No React, no I/O.
 */

import { GENAI_DEFAULT_VERSION, GENAI_IDL_ENVIRONMENT_ID, GENAI_PROJECT_VISIBILITY, GENAI_RESOURCE_TYPE, GENAI_VISIBILITY, SERVICE_URL_FIELD } from '../../constants/genaiServices';
import { idlTypeForServiceType } from '../constants/thirdPartyServices';
import { connectionSchemaName } from './genaiServices';
import type { OrgScope, ProjectScope } from '../../nav';
import type { ConnectionSchemaEntry, CreateServiceRequest, EndpointConfigDraft } from '../../types/genaiServices';
import type { ThirdPartyServiceDraft } from '../../types/thirdPartyServices';

/**
 * Base route for the Third Party Services surface. The org and project surfaces use
 * different path segments (`third-party` vs `third-party-services`), matching routes.tsx.
 */
export function thirdPartyServicesBase(scope: OrgScope | ProjectScope): string {
  return 'project' in scope ? `/organizations/${scope.org}/projects/${scope.project}/admin/third-party-services` : `/organizations/${scope.org}/admin/third-party`;
}

/** Encode an uploaded service-definition file the way the marketplace expects (base64 of url-encoded text). */
export function encodeServiceDef(text: string): string {
  return btoa(encodeURIComponent(text));
}

/**
 * Extract the first server/endpoint URL from an uploaded service definition so the
 * endpoint form can prefill it (Devant does the same). Handles OpenAPI `servers`
 * in JSON (`"servers":[{"url":"…"}]`) and YAML (`servers:\n  - url: …`). Returns '' if none.
 */
export function extractServerUrl(text: string): string {
  if (!text) return '';
  // JSON (OpenAPI): parse and read the first server's url regardless of key order.
  try {
    const parsed = JSON.parse(text) as { servers?: { url?: unknown }[] };
    const url = parsed?.servers?.[0]?.url;
    if (typeof url === 'string' && url) return url;
  } catch {
    /* not JSON — fall through to the YAML matcher */
  }
  const yaml = text.match(/servers\s*:\s*\r?\n\s*-\s*url\s*:\s*(['"]?)([^\s'"]+)\1/i);
  if (yaml) return yaml[2];
  return '';
}

/**
 * The connection-schema entries for a third-party service: the mandatory ServiceURL
 * plus the distinct additional-parameter names across all endpoints (secret preserved).
 */
export function deriveConnectionEntries(endpoints: EndpointConfigDraft[]): ConnectionSchemaEntry[] {
  const seen = new Map<string, boolean>();
  endpoints.forEach((ep) =>
    ep.params.forEach((p) => {
      const key = p.key.trim();
      // A param is sensitive if ANY occurrence of that name is marked sensitive.
      if (key) seen.set(key, (seen.get(key) ?? false) || p.isSensitive);
    }),
  );
  const paramEntries: ConnectionSchemaEntry[] = [...seen.entries()].map(([name, isSensitive]) => ({ name, type: 'string', isOptional: false, isSensitive }));
  return [{ name: SERVICE_URL_FIELD, type: 'string', isOptional: false, isSensitive: false }, ...paramEntries];
}

/**
 * Build the `POST /services` body for a third-party service. Unlike GenAI, the service
 * type is user-chosen, there's no `GenAI` tag/templateType, and the IDL comes from the
 * uploaded file. `organizationId` is required; a `projectId` makes it project-scoped.
 */
export function buildCreateThirdPartyRequest(orgUuid: string, draft: ThirdPartyServiceDraft, projectId?: string): CreateServiceRequest {
  if (!orgUuid.trim()) {
    throw new Error('Cannot register a third-party service without an organization.');
  }
  return {
    name: draft.name.trim(),
    version: draft.version.trim() || GENAI_DEFAULT_VERSION,
    summary: draft.summary.trim(),
    connectionSchemas: [
      {
        name: connectionSchemaName(draft.name),
        description: '',
        isDefault: true,
        entries: deriveConnectionEntries(draft.endpoints),
      },
    ],
    organizationId: orgUuid,
    projectId: projectId ?? '',
    serviceType: draft.serviceType,
    tags: [],
    categories: [],
    visibility: projectId ? GENAI_PROJECT_VISIBILITY : GENAI_VISIBILITY,
    isThirdParty: true,
    idl: { idlType: idlTypeForServiceType(draft.serviceType), content: draft.serviceDefContent, environmentId: GENAI_IDL_ENVIRONMENT_ID },
    status: 'CREATED',
    resourceType: GENAI_RESOURCE_TYPE,
    // `templateType` is intentionally omitted — the backend rejects an empty TemplateType,
    // and third-party services (unlike GenAI) don't belong to a template type.
  };
}
