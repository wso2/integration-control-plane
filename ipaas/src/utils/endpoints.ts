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

import type { EndpointExposure, EnvEndpoint } from '../types/component';
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

  // Fallback when no visibility-specific URL is set: the invoke URL, under the visibility the endpoint has.
  if (options.length === 0 && ep.invokeUrl) {
    const { key, label } = VISIBILITY_URLS.find((v) => set.includes(v.label)) ?? VISIBILITY_URLS[0];
    return [{ key, label, url: ep.invokeUrl }];
  }
  return options;
}

// The exposure each URL row belongs to: a gateway host's own, and Project for an endpoint on neither.
const exposureOfTier: Record<VisibilityKey, EndpointExposure> = { public: 'public', organization: 'organization', project: 'none' };

/** Whether the gateway serves the endpoint on this host, or, while it can't confirm the host, whether the saved choice is this host. */
function tierServed(ep: EnvEndpoint, key: VisibilityKey, label: string): boolean {
  if (ep.networkVisibilities?.includes(label)) return true;
  const status = key === 'public' ? ep.visibilityStatus?.public.status : ep.visibilityStatus?.organization.status;
  return status === 'UNKNOWN' && !!ep.exposure && ep.exposure === exposureOfTier[key];
}

/**
 * The Public row's URL: the API gateway's, never the component's raw OpenChoreo route, which skips
 * the gateway's security and policies. An endpoint the BFF reports no gateway state for (one not
 * exposed through the gateway at all) keeps its reported public URL.
 */
function gatewayPublicUrl(ep: EnvEndpoint, externalUrlOverride?: string): string {
  if (externalUrlOverride) return externalUrlOverride;
  if (ep.visibilityStatus) return ep.visibilityStatus.public.url ?? '';
  return ep.publicUrl || ep.defaultPublicUrl || '';
}

/**
 * The env card's URL row: the one host the endpoint is exposed on, chosen the way the visibility
 * editor opens, so the card and the editor never disagree. An endpoint on a gateway host shows that
 * host's URL; a Project-only endpoint shows its project URL. A chosen gateway host the endpoint isn't
 * served on yet, or whose URL the gateway hasn't reported, gets an empty URL, which the card shows as
 * '—', never another host's URL in its place: a Project URL under Public would read as publicly
 * reachable.
 */
export function envCardUrlRows(ep: EnvEndpoint, externalUrlOverride?: string): EndpointVisibilityUrl[] {
  const { exposure } = editorExposure(ep);
  return VISIBILITY_URLS.filter(({ key }) => exposureOfTier[key] === exposure).map(({ key, label, getUrl }) => {
    if (key !== 'project' && !tierServed(ep, key, label)) return { key, label, url: '' };
    return { key, label, url: key === 'public' ? gatewayPublicUrl(ep, externalUrlOverride) : getUrl(ep) };
  });
}

/**
 * The card's rows for an MCP server on Agent Manager's AI gateway: the proxy URL as its Public URL, and nothing
 * else. The AI gateway serves public callers only, so the endpoint's own routes, whatever their exposure, are
 * no way in. Before the proxy has a URL there is none to list.
 */
export function aiGatewayUrlRows(aiGatewayUrl: string): EndpointVisibilityUrl[] {
  return aiGatewayUrl ? [{ key: 'public', label: 'Public', url: aiGatewayUrl }] : [];
}

/**
 * The card's rows for an AI agent: its URL on Agent Manager's AI gateway, always as the Public row. Every agent is
 * deployed to the AI gateway, so Public is the one way in; '' (the gateway has no URL for it yet, or it could not
 * be read) leaves the row as "—". The endpoint's own routes are never listed: they bypass the agent's API key.
 */
export function agentGatewayUrlRows(agentGatewayUrl: string): EndpointVisibilityUrl[] {
  return [{ key: 'public', label: 'Public', url: agentGatewayUrl }];
}

/** Only Public is callable from a browser; the others are in-cluster hosts. */
export const isBrowserReachable = (key: VisibilityKey): boolean => key === 'public';

const isOn = (status?: string) => status === 'ENABLED' || status === 'ENABLING';

/**
 * The exposure the visibility editor opens on. The saved choice wins: what the gateway reports can
 * be UNKNOWN, and reading an unknown state as "not exposed" would make an unchanged save take the
 * API off the gateway. Without a saved choice, the reported tiers decide, and an UNKNOWN host (the
 * API is on the gateway, its host unconfirmed) opens as Public, the default every reconcile applies.
 * An endpoint reported on both hosts predates single-host exposure and opens as Public, the choice
 * the BFF migrates it to; `legacyBothHosts` lets the editor say so.
 */
export function editorExposure(ep: Pick<EnvEndpoint, 'exposure' | 'visibilityStatus' | 'networkVisibilities'>): { exposure: EndpointExposure; legacyBothHosts: boolean } {
  const publicOn = isOn(ep.visibilityStatus?.public.status) || !!ep.networkVisibilities?.includes('Public');
  const organizationOn = isOn(ep.visibilityStatus?.organization.status) || !!ep.networkVisibilities?.includes('Organization');
  const legacyBothHosts = publicOn && organizationOn;
  if (ep.exposure) return { exposure: ep.exposure, legacyBothHosts };
  const unknown = ep.visibilityStatus?.public.status === 'UNKNOWN' || ep.visibilityStatus?.organization.status === 'UNKNOWN';
  return { exposure: publicOn || (unknown && !organizationOn) ? 'public' : organizationOn ? 'organization' : 'none', legacyBothHosts };
}

/** The editor's label for one exposure, in the shape `updateEndpoint` takes. */
export function exposureLabels(exposure: EndpointExposure): string[] {
  return exposure === 'public' ? ['Public'] : exposure === 'organization' ? ['Organization'] : [];
}

/** Whether either host is still being added or removed; a switch between hosts moves both. */
export function isExposureTransitioning(status?: EnvEndpoint['visibilityStatus']): boolean {
  return [status?.public.status, status?.organization.status].some((s) => s === 'ENABLING' || s === 'DISABLING');
}

export type GatewayExposureState = 'enabled' | 'transitioning' | 'unknown' | 'failed' | 'none';

/**
 * What the gateway reports for an endpoint, collapsed for the env card. UNKNOWN means the API is
 * deployed but the host it serves can't be confirmed, so it counts as exposed for consumers and
 * security rather than as a failure.
 */
export function gatewayExposureState(status?: EnvEndpoint['visibilityStatus']): { state: GatewayExposureState; reason?: string } {
  const tiers = [status?.public, status?.organization];
  if (tiers.some((t) => t?.status === 'ENABLED')) return { state: 'enabled' };
  if (tiers.some((t) => t?.status === 'ENABLING' || t?.status === 'DISABLING')) return { state: 'transitioning' };
  const failed = tiers.find((t) => t?.status === 'FAILED' || t?.status === 'UNAVAILABLE');
  if (failed) return { state: 'failed', reason: failed.reason };
  if (tiers.some((t) => t?.status === 'UNKNOWN')) return { state: 'unknown' };
  return { state: 'none' };
}
