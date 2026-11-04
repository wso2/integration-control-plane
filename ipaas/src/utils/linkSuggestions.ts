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

import type { ResourceLink, ResourceLinkSuggestion } from '../types/configuration';

export type LinkSuggestionAction = 'Link' | 'Change link' | 'Link through';

/** A suggestion through one connection, with what accepting it does. */
export interface LinkSuggestionRow extends ResourceLinkSuggestion {
  connection: string;
  action: LinkSuggestionAction;
}

/**
 * One row per suggested resource and connection whose action is one of actions. A resource linked only on WSO2 Cloud
 * is offered as "Link through" (to add the integration's connection), one linked through another connection as
 * "Change link". It leaves out a connection another link goes through, or whose configurables a link made on WSO2
 * Cloud supplies.
 */
export function linkSuggestionRows(suggestions: ResourceLinkSuggestion[], links: ResourceLink[], actions: LinkSuggestionAction[]): LinkSuggestionRow[] {
  const known = suggestions.flatMap((s) => s.connections);
  return suggestions.flatMap((s) => {
    const taken = new Set(links.filter((l) => l.linked && l.resourceType !== s.resourceType).flatMap((l) => (l.connection ? [l.connection] : l.environments.flatMap((e) => Object.keys(e.configurables).map((k) => connectionOf(k, known))))));
    const action: LinkSuggestionAction = !s.linked ? 'Link' : s.linkedConnection ? 'Change link' : 'Link through';
    if (!actions.includes(action)) return [];
    return s.connections.filter((c) => !taken.has(c)).map((connection) => ({ ...s, connection, action }));
  });
}

/** A suggested resource with every connection it is suggested through, best match first. */
export interface LinkOffer {
  resourceType: string;
  displayName: string;
  package: string;
  action: LinkSuggestionAction;
  connections: string[];
  linkedConnection?: string;
}

/** The rows of linkSuggestionRows, one offer per resource. */
export const linkOffers = (rows: LinkSuggestionRow[]): LinkOffer[] =>
  rows.reduce<LinkOffer[]>((offers, r) => {
    const offer = offers.find((o) => o.resourceType === r.resourceType);
    if (offer) offer.connections.push(r.connection);
    else offers.push({ resourceType: r.resourceType, displayName: r.displayName, package: r.package, action: r.action, connections: [r.connection], ...(r.linkedConnection && { linkedConnection: r.linkedConnection }) });
    return offers;
  }, []);

// A connection's configurables are named after it and a connector field: sfSales + BaseUrl. The longest connection
// that names a key that way owns it, so sfSales2BaseUrl belongs to sfSales2, not sfSales.
const connectionOf = (key: string, connections: string[]): string | undefined => connections.filter((c) => key.startsWith(c) && /^[A-Z]/.test(key.slice(c.length))).sort((a, b) => b.length - a.length)[0];
