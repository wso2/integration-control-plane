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
 * Pure helpers for the GenAI register flow: derive the wizard draft from a provider
 * template, and flatten the draft + endpoints into the marketplace create/connection
 * payloads. No React, no I/O. Unit-tested.
 */

import {
  GENAI_DEFAULT_VERSION,
  GENAI_IDL_ENVIRONMENT_ID,
  GENAI_IDL_TYPE,
  GENAI_PROJECT_VISIBILITY,
  GENAI_PROVIDER_META,
  GENAI_PROVIDER_TOKENS,
  GENAI_RESOURCE_TYPE,
  GENAI_SERVICE_TYPE,
  GENAI_TEMPLATE_TYPE,
  GENAI_VISIBILITY,
  SERVICE_URL_CONFIG_KEY,
  SERVICE_URL_FIELD,
} from '../../constants/genaiServices';
import type { OrgScope, ProjectScope } from '../../nav';
import type {
  ConnectionConfigGroup,
  ConnectionConfigRequest,
  ConnectionConfigResponse,
  ConnectionEndpointDraft,
  ConnectionSchemaEntry,
  CreateServiceRequest,
  EndpointConfigDraft,
  GenAiProviderTemplateDetail,
  GenAiService,
  GenAiServiceDraft,
  GenAiServiceEdit,
  UpdateServiceRequest,
} from '../../types/genaiServices';

/**
 * Base route for the GenAI Services surface. The org and project surfaces use different
 * path segments (`genai-services` vs `gen-ai-services`), matching the existing route table.
 */
export function genaiServicesBase(scope: OrgScope | ProjectScope): string {
  return 'project' in scope ? `/organizations/${scope.org}/projects/${scope.project}/admin/gen-ai-services` : `/organizations/${scope.org}/admin/genai-services`;
}

/** Connection-schema display name derived from the service name (matches Devant). */
export function connectionSchemaName(serviceName: string): string {
  return `${serviceName.trim()} - Connection Configuration`;
}

/**
 * Turn a chosen provider template into the step-2 draft: the OpenAPI service
 * definition, the endpoint base URL default, and the connection fields the user must
 * fill (provider `userDefinedConfigs` + non-URL `defaultConfigs` + the mandatory ServiceURL).
 */
export function templateToDraft(template: GenAiProviderTemplateDetail): GenAiServiceDraft {
  const serviceUrlDefault = template.defaultConfigs.find((c) => c.key === SERVICE_URL_CONFIG_KEY)?.value ?? '';
  const userEntries: ConnectionSchemaEntry[] = template.userDefinedConfigs.map((c) => ({
    name: c.name,
    type: c.configType || 'string',
    isOptional: false,
    isSensitive: c.isSensitive,
  }));
  const otherDefaults: ConnectionSchemaEntry[] = template.defaultConfigs.filter((c) => c.key !== SERVICE_URL_CONFIG_KEY).map((c) => ({ name: c.key, type: 'string', isOptional: false, isSensitive: false }));
  const connectionEntries: ConnectionSchemaEntry[] = [...userEntries, ...otherDefaults, { name: SERVICE_URL_FIELD, type: 'string', isOptional: false, isSensitive: false }];
  return {
    name: '',
    version: GENAI_DEFAULT_VERSION,
    summary: '',
    serviceUrl: serviceUrlDefault,
    serviceUrlLocked: serviceUrlDefault !== '',
    serviceDefContent: template.spec?.content ?? '',
    connectionEntries,
  };
}

/**
 * Build the `POST /services` body. `organizationId` is required by the backend.
 * When `projectId` is supplied the service is project-scoped (visibility PROJECT).
 */
export function buildCreateServiceRequest(orgUuid: string, draft: GenAiServiceDraft, projectId?: string): CreateServiceRequest {
  if (!orgUuid.trim()) {
    throw new Error('Cannot register a GenAI service without an organization.');
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
        entries: draft.connectionEntries,
      },
    ],
    organizationId: orgUuid,
    projectId: projectId ?? '',
    serviceType: GENAI_SERVICE_TYPE,
    tags: [GENAI_TEMPLATE_TYPE],
    categories: [],
    visibility: projectId ? GENAI_PROJECT_VISIBILITY : GENAI_VISIBILITY,
    isThirdParty: true,
    idl: { idlType: GENAI_IDL_TYPE, content: draft.serviceDefContent, environmentId: GENAI_IDL_ENVIRONMENT_ID },
    status: 'CREATED',
    resourceType: GENAI_RESOURCE_TYPE,
    templateType: GENAI_TEMPLATE_TYPE,
  };
}

/**
 * Flatten the step-3 endpoints into the connection-config `configs` map (keyed by
 * endpoint name). Empty-named endpoints and blank values are dropped.
 */
export function buildConnectionConfigPayload(endpoints: ConnectionEndpointDraft[]): ConnectionConfigRequest {
  const configs: Record<string, ConnectionConfigGroup> = {};
  endpoints.forEach((ep) => {
    const name = ep.name.trim();
    if (!name) return;
    configs[name] = {
      name,
      environmentTemplateIds: ep.environmentIds,
      values: Object.entries(ep.values)
        .filter(([, v]) => v != null && v.trim() !== '')
        .map(([key, value]) => ({ key, value })),
    };
  });
  return { configs };
}

/**
 * Rebuild the full `PUT /services/{id}` body from a fetched service plus the edited
 * General Details fields. The IDL is updated via a separate endpoint, so it is omitted.
 */
export function buildUpdateServiceRequest(orgUuid: string, service: GenAiService, edit: GenAiServiceEdit): UpdateServiceRequest {
  if (!orgUuid.trim()) {
    throw new Error('Cannot update a GenAI service without an organization.');
  }
  return {
    name: edit.name.trim(),
    version: service.version,
    summary: edit.summary.trim(),
    description: edit.description,
    connectionSchemas: service.connectionSchemas ?? [],
    organizationId: orgUuid,
    projectId: service.projectId ?? '',
    serviceType: service.serviceType,
    tags: edit.tags,
    categories: service.categories ?? [],
    visibility: service.visibility?.length ? service.visibility : GENAI_VISIBILITY,
    isThirdParty: true,
    status: String(service.status),
    resourceType: GENAI_RESOURCE_TYPE,
    // Preserve the service's own template type; omit it entirely for plain third-party
    // services (an empty TemplateType is rejected by the backend).
    ...(service.templateType ? { templateType: service.templateType } : {}),
  };
}

/** Percent-decode IDL content when it's URL-encoded; otherwise return it unchanged. */
export function normalizeIdlContent(content: string): string {
  if (/%[0-9A-F]{2}/i.test(content)) {
    try {
      return decodeURIComponent(content);
    } catch {
      return content;
    }
  }
  return content;
}

/** Map a saved connection config into editable per-endpoint drafts (splitting the endpoint URL out). */
export function connectionConfigToEndpoints(config: ConnectionConfigResponse | undefined, entries: ConnectionSchemaEntry[]): EndpointConfigDraft[] {
  const isSensitive = (key: string) => entries.find((e) => e.name === key)?.isSensitive ?? false;
  return Object.values(config?.configs ?? {}).map((group) => ({
    name: group.name,
    serviceUrl: group.values.find((v) => v.key === SERVICE_URL_FIELD)?.value ?? '',
    params: group.values.filter((v) => v.key !== SERVICE_URL_FIELD).map((v) => ({ key: v.key, value: v.value, isSensitive: isSensitive(v.key) })),
    environmentIds: group.environmentTemplateIds,
  }));
}

/** Flatten edited endpoint drafts back into the connection-config request (URL + params per endpoint). */
export function endpointsToConfigRequest(endpoints: EndpointConfigDraft[]): ConnectionConfigRequest {
  const configs: Record<string, ConnectionConfigGroup> = {};
  endpoints.forEach((ep) => {
    const name = ep.name.trim();
    if (!name) return;
    configs[name] = {
      name,
      environmentTemplateIds: ep.environmentIds,
      values: [{ key: SERVICE_URL_FIELD, value: ep.serviceUrl }, ...ep.params.map((p) => ({ key: p.key, value: p.value }))],
    };
  });
  return { configs };
}

/**
 * Best-effort provider logo filename for a service, inferred from its connection-parameter
 * names (a service doesn't record which template it came from). Returns undefined when no
 * known provider token matches, so callers can fall back to a generic avatar.
 */
export function inferProviderLogo(entryNames: string[]): string | undefined {
  const upper = entryNames.map((n) => n.toUpperCase());
  const match = GENAI_PROVIDER_TOKENS.find(({ token }) => upper.some((n) => n.includes(token)));
  return match ? GENAI_PROVIDER_META[match.provider]?.logo : undefined;
}

/** Format a unix-seconds `createdTime` string for the list's Created column. */
export function formatServiceCreatedTime(createdTime: string): string {
  const secs = Number(createdTime);
  if (!Number.isFinite(secs) || secs <= 0) return '—';
  return new Date(secs * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
