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

/** A suggestion through one connection, with what accepting it does. */
export interface LinkSuggestionRow extends ResourceLinkSuggestion {
  connection: string;
  action: 'Link' | 'Change link' | 'Link through';
}

/**
 * One row per suggested resource and connection, leaving out a connection another link already supplies. A resource
 * linked from WSO2 Cloud under its own key names is offered as "Link through", one linked through another
 * connection as "Change link".
 */
export function linkSuggestionRows(suggestions: ResourceLinkSuggestion[], links: ResourceLink[]): LinkSuggestionRow[] {
  return suggestions.flatMap((s) => {
    const taken = links.filter((l) => l.linked && l.resourceType !== s.resourceType).flatMap((l) => l.environments.flatMap((e) => Object.keys(e.configurables)));
    const action = !s.linked ? 'Link' : s.linkedConnection ? 'Change link' : 'Link through';
    return s.connections.filter((c) => !taken.some((k) => k.startsWith(c))).map((connection) => ({ ...s, connection, action }));
  });
}
