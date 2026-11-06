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

import { Permissions, Scopes } from './permissions';
import { isSettingsSectionVisible, type SettingsSectionDef } from './orgSettingsSections';
import type { IntegrationIdentity } from '../types/integration';

export type { SettingsSectionDef };
export { isSettingsSectionVisible };

/**
 * An Integration (component) Settings section. `appliesTo` decides type-based
 * visibility (Devant's component Settings tabs are type-specific); `permissions`
 * decides RBAC visibility — same two-stage model as Org/Project.
 */
export interface ComponentSettingsSectionDef extends SettingsSectionDef {
  /** Whether this section applies to the given integration identity. */
  appliesTo: (identity: IntegrationIdentity | null) => boolean;
  /**
   * Whether the section's page has a route in config/routes.tsx. A section whose page is still in src/unported is
   * neither offered nor landed on, since its URL only redirects away.
   */
  routed: boolean;
}

const isProxy = (identity: IntegrationIdentity | null): boolean => identity?.raw.displayType === 'proxy' || identity?.raw.displayType === 'gitProxy';
const isByoi = (identity: IntegrationIdentity | null): boolean => identity?.type === 'tailscale-vpn' || (identity?.raw.displayType ?? '').startsWith('byoi');

// URL Settings applies to endpoint-exposing integration types (services, webhooks,
// proxies, MCP), matching Devant. Automation/Tailscale have no inbound URL.
const URL_SETTINGS_TYPES = new Set(['integration-as-api', 'mcp-server', 'mcp-proxy', 'webhook', 'event-integration', 'ai-agent', 'file-integration']);

/** URL Settings needs the feature flag on AND the URL-manager service configured (mirrors Devant's flag + eligibility). */
export function urlSettingsEnabled(): boolean {
  return !!window.API_CONFIG?.enableCustomUrlMappings && !!window.API_CONFIG?.urlManagerUrl;
}

// NOTE: Devant's component Settings shell has no Access Control tab (it's Choreo-
// full-platform / org+project only). Component-level Access Control stays its own
// standalone page; it is intentionally NOT a section here.
export const COMPONENT_SETTINGS_SECTIONS: readonly ComponentSettingsSectionDef[] = [
  // Deployment Tracks: source-built integrations only (not BYOI proxies like Tailscale, not API/MCP proxies).
  { id: 'deployment-tracks', label: 'Deployment tracks', path: 'deployment-tracks', permissions: [Scopes.INTEGRATION_READ], appliesTo: (i) => !isProxy(i) && !isByoi(i), routed: true },
  // Proxy Versions: proxy components (e.g. MCP proxy).
  { id: 'proxy-versions', label: 'Proxy versions', path: 'proxy-versions', permissions: [Permissions.INTEGRATION_VIEW, Permissions.INTEGRATION_MANAGE], appliesTo: (i) => isProxy(i), routed: false },
  // URL Settings (custom domains): endpoint-exposing types, gated by the custom-URL feature flag + URL-manager service config.
  { id: 'url-settings', label: 'URL settings', path: 'url-settings', permissions: [Permissions.INTEGRATION_VIEW, Permissions.INTEGRATION_MANAGE], appliesTo: (i) => urlSettingsEnabled() && !!i && URL_SETTINGS_TYPES.has(i.type), routed: false },
];

/** Sections that are routed, applicable to the integration type AND visible to the user. */
export function visibleComponentSettingsSections(identity: IntegrationIdentity | null, hasAnyPermission: (perms: string[]) => boolean): ComponentSettingsSectionDef[] {
  return COMPONENT_SETTINGS_SECTIONS.filter((s) => s.routed && s.appliesTo(identity) && isSettingsSectionVisible(s, hasAnyPermission));
}

/** The first applicable + permitted section, or `null`. */
export function firstAvailableComponentSettingsSection(identity: IntegrationIdentity | null, hasAnyPermission: (perms: string[]) => boolean): ComponentSettingsSectionDef | null {
  return visibleComponentSettingsSections(identity, hasAnyPermission)[0] ?? null;
}
