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
 * What the WSO2 Cloud platform switcher shows, built from config.json as the Agent Platform console builds it. Kept
 * free of browser globals and UI imports so it is tested on its own.
 */

/** This console's id in the switcher. */
export const CURRENT_PLATFORM = 'integration-platform';

/** The platforms, in display order, with the billing product code each is sold under. */
export const PLATFORMS = [
  { id: 'agent-manager', name: 'Agent Manager', billingCode: 'agent' },
  { id: 'api-platform', name: 'API Platform', billingCode: 'bijira' },
  { id: 'integration-platform', name: 'Integration Platform', billingCode: 'devant' },
  { id: 'identity-platform', name: 'Identity Platform', billingCode: 'asgardeo' },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]['id'];

export interface PlatformSwitcherConfig {
  /** Each platform console's URL, or its path when it shares this origin. */
  platformUrls?: Partial<Record<PlatformId, string>>;
  /** Platform ids shown as coming soon. */
  comingSoonPlatforms?: readonly string[];
}

export interface SwitcherLink {
  id: string;
  name: string;
  /** null: shown as coming soon. */
  url: string | null;
  /** Billing's product code, for a platform billing sells. */
  billingCode?: string;
}

/**
 * Each platform with a URL in this environment; one marked coming soon shows without it. This console defaults to
 * `ownUrl`. WSO2 Cloud itself is the switcher's Manage row, not a platform.
 */
export function buildPlatformSwitcher(config: PlatformSwitcherConfig | undefined, ownUrl: string): SwitcherLink[] {
  const comingSoon = new Set(config?.comingSoonPlatforms ?? []);
  const links: SwitcherLink[] = [];
  for (const { id, name, billingCode } of PLATFORMS) {
    const url = config?.platformUrls?.[id]?.trim() || (id === CURRENT_PLATFORM ? ownUrl : undefined);
    if (id !== CURRENT_PLATFORM && comingSoon.has(id)) links.push({ id, name, url: null });
    // A platform with no URL in this environment is left out.
    else if (url) links.push({ id, name, url, billingCode });
  }
  return links;
}
