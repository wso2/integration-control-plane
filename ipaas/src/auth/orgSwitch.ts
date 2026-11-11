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

import { withBase } from '../utils/basePath';
import { isBffAuth } from './thunderConfig';

/**
 * The cloud console's session switch. The gateway serves it at this fixed context in every environment
 * (gateway-bff/platform/auth-cloud-restapi.yaml), as the API Platform console assumes too.
 */
const CLOUD_SWITCH_URL = '/_auth/cloud/switch';

/**
 * Whether the header can switch organizations: ORGANIZATION_SWITCHER, with gateway sign-in, since only the
 * gateway can move a session in place.
 */
export function canSwitchOrganization(): boolean {
  return isBffAuth() && window.API_CONFIG.organizationSwitcher;
}

/**
 * The sessions a switch moves, in order: the cloud console's first, since billing and every product session
 * are minted from it, then this console's (`<AUTH_BFF_CONTEXT>/switch`).
 */
function organizationSwitchUrls(): string[] {
  return [CLOUD_SWITCH_URL, `${window.API_CONFIG.authBffContext}/switch`];
}

/**
 * Why a switch failed: the organization refused the user (403); the sessions are back where they were
 * (`failed`); or moving them back failed too, so they sit in different organizations (`incomplete`).
 */
export type OrganizationSwitchFailure = 'forbidden' | 'failed' | 'incomplete';

const FAILURE_MESSAGES: Record<OrganizationSwitchFailure, string> = {
  forbidden: 'The organization refused the switch.',
  failed: 'The switch did not complete.',
  incomplete: 'The switch did not complete, and the sessions moved so far could not be moved back.',
};

export class OrganizationSwitchError extends Error {
  readonly reason: OrganizationSwitchFailure;

  constructor(reason: OrganizationSwitchFailure) {
    super(FAILURE_MESSAGES[reason]);
    this.name = 'OrganizationSwitchError';
    this.reason = reason;
  }
}

/** Moves one gateway session into `ouId`, as oauth2-org-switch asks: the unit in the query and the JSON body. */
async function moveSession(url: string, ouId: string): Promise<void> {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}ouId=${encodeURIComponent(ouId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ ouId }),
  }).catch(() => null);
  if (response?.status === 403) throw new OrganizationSwitchError('forbidden');
  if (!response?.ok) throw new OrganizationSwitchError('failed');
}

/**
 * Moves every session in organizationSwitchUrls() into `targetId`, in order. When a later one
 * fails, the sessions already moved are moved back to `currentId`, so they don't sit in different
 * organizations, and the failure is rethrown. If moving one back fails too, it rejects with `incomplete`:
 * switching to `targetId` again finishes the move, since each endpoint only sets its session's organization.
 */
export async function switchOrganization(targetId: string, currentId: string): Promise<void> {
  const moved: string[] = [];
  for (const url of organizationSwitchUrls()) {
    try {
      await moveSession(url, targetId);
    } catch (error) {
      let restored = true;
      for (const done of moved.reverse()) {
        await moveSession(done, currentId).catch(() => {
          restored = false;
        });
      }
      throw restored ? error : new OrganizationSwitchError('incomplete');
    }
    moved.push(url);
  }
}

/**
 * Loads the console root in a full page load, which lands on the session's organization the way a
 * sign-in does (PublicLayout). After a switch the page still holds the previous organization's URL,
 * cached queries and project; a fresh load drops them all.
 */
export function loadConsoleHome(): void {
  window.location.assign(withBase('/'));
}
