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
 * Cloud API security & exposure, against the ipaas-service BFF. Org context comes
 * from the JWT, so no call takes an org parameter.
 */

import type {
  ApiExposure,
  ApiKeyAuthOptions,
  ApiKeyResult,
  ApiKeySummary,
  Consumer,
  ConsumerApplication,
  CreateApiKeyInput,
  CreateApplicationInput,
  CreateConsumerInput,
  EndpointPolicyConfig,
  EndpointRef,
  SecurityConfig,
  ConsumerCredential,
} from '../types/consumers';
import { normalizeConsumerStatus } from '../utils/apiConsumption';
import { userFacingError } from '../utils/apiSecurity';
import { bff, items, q, seg, type ListResponse } from './_client';

/** List routes return a bare array; other BFF routes use `{ items: [] }`. Accept both. */
const asList = <T>(r: T[] | ListResponse<T> | null | undefined): T[] => (Array.isArray(r) ? r : items(r));

const endpointPath = ({ componentName, environmentName, endpointName }: EndpointRef): string => `/components/${seg(componentName)}/environments/${seg(environmentName)}/endpoints/${seg(endpointName)}`;
const endpointURL = (ref: EndpointRef, suffix: string): string => `${endpointPath(ref)}${suffix}${q({ projectName: ref.projectName })}`;

/** No "get exposure" route exists, so the handle is derived. Prefer `exposeEndpoint`'s when known. */
const deriveRestApiId = (ref: EndpointRef): string => `${ref.projectName}-${ref.componentName}-${ref.endpointName}`;

// ---------------------------------------------------------------------------
// Exposure
// ---------------------------------------------------------------------------

export const exposeEndpoint = (ref: EndpointRef): Promise<ApiExposure> => bff.post<ApiExposure>(endpointURL(ref, '/expose'));

export const unexposeEndpoint = (ref: EndpointRef): Promise<void> => bff.delete<void>(endpointURL(ref, '/expose'));

// ---------------------------------------------------------------------------
// Endpoint security — API keys
// ---------------------------------------------------------------------------

export const listEndpointApiKeys = (ref: EndpointRef): Promise<ApiKeySummary[]> => bff.get<ApiKeySummary[] | ListResponse<ApiKeySummary>>(endpointURL(ref, '/api-keys')).then(asList);

export const createEndpointApiKey = (ref: EndpointRef, input: CreateApiKeyInput): Promise<ApiKeyResult> => bff.post<ApiKeyResult>(endpointURL(ref, '/api-keys'), input);

export const revokeEndpointApiKey = (ref: EndpointRef, keyName: string): Promise<void> => bff.delete<void>(endpointURL(ref, `/api-keys/${seg(keyName)}`));

/** One-click 1h credential. Also forces `api-key-auth` on (no-op when already on). */
export const createEndpointTestKey = (ref: EndpointRef): Promise<ApiKeyResult> => bff.post<ApiKeyResult>(endpointURL(ref, '/test-key'));

// ---------------------------------------------------------------------------
// Endpoint security — enforcement policies
// ---------------------------------------------------------------------------

interface AuthToggleResponse {
  enabled?: boolean;
}

// A 200 with an empty body must not read as "toggle failed".
const toggled =
  (requested: boolean) =>
  (r: AuthToggleResponse | null | undefined): boolean =>
    r?.enabled ?? requested;

export const setEndpointApiKeyAuth = (ref: EndpointRef, enabled: boolean, options?: ApiKeyAuthOptions): Promise<boolean> => bff.put<AuthToggleResponse>(endpointURL(ref, '/security/api-key'), { enabled, ...options }).then(toggled(enabled));

export const setEndpointJwtAuth = (ref: EndpointRef, enabled: boolean): Promise<boolean> => bff.put<AuthToggleResponse>(endpointURL(ref, '/security/jwt'), { enabled }).then(toggled(enabled));

/** Read the single active auth mode (+ options) of the exposed API. */
export const getEndpointSecurity = (ref: EndpointRef): Promise<SecurityConfig> => bff.get<SecurityConfig>(endpointURL(ref, '/security'));

/** Set the single active auth mode. The BFF clears the other mode + redeploys. */
export const setEndpointSecurity = (ref: EndpointRef, cfg: SecurityConfig): Promise<SecurityConfig> => bff.put<SecurityConfig>(endpointURL(ref, '/security'), cfg);

// ---------------------------------------------------------------------------
// Endpoint policies — CORS and rate limiting, written independently of /security
// ---------------------------------------------------------------------------

export const getEndpointPolicies = (ref: EndpointRef): Promise<EndpointPolicyConfig> => bff.get<EndpointPolicyConfig>(endpointURL(ref, '/policies'));

/** Replaces both policies and redeploys. */
export const setEndpointPolicies = (ref: EndpointRef, cfg: EndpointPolicyConfig): Promise<EndpointPolicyConfig> => bff.put<EndpointPolicyConfig>(endpointURL(ref, '/policies'), cfg);

// ---------------------------------------------------------------------------
// Consumer applications
// ---------------------------------------------------------------------------

const listApplications = (projectName: string): Promise<ConsumerApplication[]> => bff.get<ConsumerApplication[] | ListResponse<ConsumerApplication>>(`/applications?projectName=${encodeURIComponent(projectName)}`).then(asList);

const createApplication = (input: CreateApplicationInput): Promise<ConsumerApplication> => bff.post<ConsumerApplication>('/applications', input);

const deleteApplication = (applicationId: string): Promise<void> => bff.delete<void>(`/applications/${seg(applicationId)}`);

// ---------------------------------------------------------------------------
// Consumers — an application (durable identity, tagged with its endpoint in
// `description`) plus an endpoint api-key; the BFF has no /subscriptions routes.
// ---------------------------------------------------------------------------

const ENDPOINT_TAG_PREFIX = 'endpoint:';

const endpointTag = (ref: EndpointRef): string => `${ENDPOINT_TAG_PREFIX}${ref.projectName}/${ref.componentName}/${ref.environmentName}/${ref.endpointName}`;

/** Keys minted here carry the application id as `displayName`; older keys group under their own name. */
function groupKeysByConsumer(keys: ApiKeySummary[]): Map<string, ApiKeySummary[]> {
  const groups = new Map<string, ApiKeySummary[]>();
  for (const key of keys) {
    const consumerId = key.displayName || key.name;
    const group = groups.get(consumerId);
    if (group) group.push(key);
    else groups.set(consumerId, [key]);
  }
  return groups;
}

function toConsumer(row: { id: string; displayName: string; application?: ConsumerApplication }, keys: ApiKeySummary[], restApiId: string): Consumer {
  // Revoke only flips status; the key stays listed forever. Carrying dead keys
  // would re-DELETE the whole history on every action.
  const activeKeys = keys.filter((k) => normalizeConsumerStatus(k.status) === 'active');
  return {
    ...row,
    credential: { id: activeKeys[0]?.name ?? keys[0]?.name ?? row.id, applicationId: row.id, restApiId, createdAt: row.application?.createdAt },
    status: activeKeys.length > 0 ? 'active' : 'revoked',
    credentialIds: activeKeys.map((k) => k.name),
  };
}

const resultToCredential = (r: ApiKeyResult, restApiId: string, applicationId: string): ConsumerCredential => ({
  id: r.keyId,
  applicationId,
  restApiId,
  token: r.apiKey,
});

export async function fetchConsumers(ref: EndpointRef, projectName?: string): Promise<Consumer[]> {
  const restApiId = deriveRestApiId(ref);
  // Must propagate: swallowing it drops every row to the key-only path, where
  // delete skips the application and silently only revokes.
  const [keys, applications] = await Promise.all([listEndpointApiKeys(ref), projectName ? listApplications(projectName) : Promise.resolve([] as ConsumerApplication[])]);

  const groups = groupKeysByConsumer(keys);
  const tag = endpointTag(ref);
  const ofThisEndpoint = applications.filter((app) => app.description === tag);

  const rows = ofThisEndpoint.map((app) => toConsumer({ id: app.id, displayName: app.displayName || app.id, application: app }, groups.get(app.id) ?? [], restApiId));
  const claimed = new Set(ofThisEndpoint.map((app) => app.id));
  for (const [consumerId, group] of groups) {
    if (claimed.has(consumerId)) continue;
    // Revoked-only groups are already-deleted consumers; listing them would also
    // resurrect an application-backed row once its application is deleted.
    if (!group.some((k) => normalizeConsumerStatus(k.status) === 'active')) continue;
    rows.push(toConsumer({ id: consumerId, displayName: group[0].displayName || consumerId }, group, restApiId));
  }
  return rows;
}

export async function createConsumer(input: CreateConsumerInput): Promise<Consumer> {
  const { appName, projectName, componentName, environmentName, endpointName } = input;
  const ref: EndpointRef = { projectName, componentName, environmentName, endpointName };

  // Application first so the key can be minted under its id; rolled back on failure.
  const application = await createApplication({ displayName: appName, projectName, description: endpointTag(ref) });

  let result: ApiKeyResult;
  try {
    result = await createEndpointApiKey(ref, { displayName: application.id });
  } catch (err) {
    await deleteApplication(application.id).catch(() => undefined);
    throw err;
  }

  return {
    id: application.id,
    displayName: appName,
    application,
    credential: resultToCredential(result, deriveRestApiId(ref), application.id),
    status: 'active',
    credentialIds: [result.keyId],
  };
}

/** Revoke every key, then mint a fresh one under the same application — never adds a row. */
export async function regenerateConsumerToken(ref: EndpointRef, consumer: Consumer): Promise<ConsumerCredential> {
  await revokeConsumerKeys(ref, consumer);
  try {
    const result = await createEndpointApiKey(ref, { displayName: consumer.id });
    return resultToCredential(result, deriveRestApiId(ref), consumer.id);
  } catch (err) {
    throw userFacingError(`The old API key was revoked, but a new one could not be issued for “${consumer.displayName}”. Close this dialog and regenerate again.`, err);
  }
}

// Empty means nothing left to revoke. Must stay a no-op: `credential.id` falls
// back to the application id, which is not a key name and would 404.
async function revokeConsumerKeys(ref: EndpointRef, consumer: Consumer): Promise<void> {
  await Promise.all(consumer.credentialIds.map((keyName) => revokeEndpointApiKey(ref, keyName)));
}

export const revokeConsumer = (ref: EndpointRef, consumer: Consumer): Promise<void> => revokeConsumerKeys(ref, consumer);

/** Revoke first — a failed application delete must not leave a live key behind an invisible row. */
export async function deleteConsumer(ref: EndpointRef, consumer: Consumer): Promise<void> {
  await revokeConsumerKeys(ref, consumer);
  if (consumer.application) await deleteApplication(consumer.application.id);
}
