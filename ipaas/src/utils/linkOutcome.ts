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

import type { ResourceLinkWrite } from '../types/configuration';

/** The one line a link write answers with: when each environment gets the change, and where the resource has no values yet. */
export function linkOutcomeMessage(w: ResourceLinkWrite, changed: boolean): { severity: 'warning' | 'info'; message: string } {
  const what = changed && w.connection ? `${w.resourceType} now goes through ${w.connection}.` : `${w.resourceType} is linked.`;
  const when = {
    updated: ' Development gets it now; other environments get it when you promote to them.',
    next_deploy: " Development gets it at the integration's next deploy; other environments get it when you promote to them.",
    unchanged: '',
    next_build: ' Build again to use it.',
  }[w.workload];
  const values = w.environmentsWithoutValues.length > 0 ? ` It has no values in ${listed(w.environmentsWithoutValues)} yet; add them on WSO2 Cloud before you promote.` : '';
  return { severity: values ? 'warning' : 'info', message: what + when + values };
}

const listed = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
