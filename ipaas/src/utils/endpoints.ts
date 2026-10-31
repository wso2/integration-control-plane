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

import type { EnvEndpoint } from '../types/component';
import type { EndpointOption } from '../types/consumers';

/**
 * Drop a redundant leading "Endpoint" word from a label, so "Endpoint Covid Status"
 * reads as "Covid Status". The trailing whitespace is required: without it the word
 * boundary also matches before a hyphen, turning the generated key "endpoint-9097"
 * into "-9097".
 */
export function trimEndpointName(name: string): string {
  const raw = name ?? '';
  return (
    raw
      .replace(/^\s*Endpoint\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim() || raw
  );
}

/** Endpoint keys the build pipeline generates when the spec title was unusable. */
const GENERATED_ENDPOINT_KEY = /^endpoint-\d+$/i;

const hasLetter = (value: string) => /[a-z]/i.test(value);

/**
 * Resolve the label to show for an endpoint.
 *
 * The Ballerina OpenAPI generator derives `info.title` from the service base path, so
 * `service / on ...` yields "/", a listener with no base path yields "", and a service
 * bound to a listener variable yields a numeric hash. None of those name anything, and
 * the build pipeline applies the same "must contain a letter" test when it generates the
 * endpoint key (RFC 6335), falling back to `endpoint-<port>`.
 *
 * Order: spec title → endpoint key (when it is not that generated form, so component.yaml
 * names like "greeter-api" still win) → the port number.
 */
export function getEndpointLabel(endpoint: { displayName?: string | null; name?: string | null; port?: number | null }): string {
  const title = trimEndpointName(endpoint.displayName ?? '').trim();
  if (hasLetter(title)) return title;

  const key = trimEndpointName(endpoint.name ?? '').trim();
  if (hasLetter(key) && !GENERATED_ENDPOINT_KEY.test(key)) return key;

  return endpoint.port != null ? String(endpoint.port) : key;
}

/**
 * Resolve the URL to invoke an endpoint at, preferring the widest network
 * visibility it is exposed on (Public → Organization → Project), then any URL
 * available. The trailing slash is stripped so a path can be appended cleanly.
 */
export function resolveEndpointInvokeUrl(endpoint: EnvEndpoint | undefined): string {
  if (!endpoint) return '';
  const visibilities = endpoint.networkVisibilities ?? [];
  const preferred: Array<string | null | undefined> = [];
  if (visibilities.includes('Public')) preferred.push(endpoint.publicUrl, endpoint.defaultPublicUrl);
  if (visibilities.includes('Organization')) preferred.push(endpoint.organizationUrl, endpoint.defaultOrganizationUrl);
  if (visibilities.includes('Project')) preferred.push(endpoint.projectUrl);
  const url = [...preferred, endpoint.publicUrl, endpoint.defaultPublicUrl, endpoint.organizationUrl, endpoint.defaultOrganizationUrl, endpoint.projectUrl, endpoint.invokeUrl].find((u) => !!u) ?? '';
  return url.replace(/\/+$/, '');
}

/** Environment endpoints as the options the cloud API drawers select from. */
export const toEndpointOptions = (endpoints: EnvEndpoint[]): EndpointOption[] => endpoints.map((ep) => ({ name: ep.id, displayName: ep.displayName || ep.id, networkVisibilities: ep.networkVisibilities, visibilityStatus: ep.visibilityStatus }));

export type VisibilityKey = 'public' | 'organization' | 'project';

export interface EndpointVisibilityUrl {
  key: VisibilityKey;
  /** Matches the values in networkVisibilities. */
  label: string;
  url: string;
}

const VISIBILITY_URLS: { key: VisibilityKey; label: string; getUrl: (ep: EnvEndpoint) => string }[] = [
  { key: 'public', label: 'Public', getUrl: (ep) => ep.publicUrl || ep.defaultPublicUrl || '' },
  { key: 'organization', label: 'Organization', getUrl: (ep) => ep.organizationUrl || ep.defaultOrganizationUrl || '' },
  { key: 'project', label: 'Project', getUrl: (ep) => ep.projectUrl || '' },
];

/**
 * Invoke URLs for the visibilities set on the endpoint. `externalUrlOverride` replaces the Public
 * URL with the API Platform gateway URL.
 */
export function visibilityUrlOptions(ep: EnvEndpoint, externalUrlOverride?: string): EndpointVisibilityUrl[] {
  const set = ep.networkVisibilities ?? [];
  const options = VISIBILITY_URLS.map(({ key, label, getUrl }) => ({
    key,
    label,
    url: key === 'public' && externalUrlOverride ? externalUrlOverride : getUrl(ep),
  })).filter((o) => !!o.url && (set.length === 0 || set.includes(o.label)));

  // Fallback when no visibility-specific URL is set.
  if (options.length === 0 && ep.invokeUrl) return [{ key: 'public', label: 'Public', url: ep.invokeUrl }];
  return options;
}

/** Only Public is callable from a browser; the others are in-cluster hosts. */
export const isBrowserReachable = (key: VisibilityKey): boolean => key === 'public';
