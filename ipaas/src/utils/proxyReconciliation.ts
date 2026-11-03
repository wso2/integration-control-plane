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

import type { ProxyReconciliationStatus } from '../types/deployment';
import { codedApiError } from './apiSecurity';

export interface ProxyReconciliationNotice {
  severity: 'info' | 'warning' | 'error';
  text: string;
  /** A retry can move the state: a failure with no known cause the user has to fix first. */
  retry: boolean;
}

/**
 * The env card's line for where the API gateway stands against the environment's release, or null
 * when there is nothing to say. Error codes are stable and sanitized, so a known one gets its own
 * wording and any other is shown as is.
 */
export function proxyReconciliationNotice(status: ProxyReconciliationStatus | null | undefined): ProxyReconciliationNotice | null {
  switch (status?.status) {
    case 'PENDING':
    case 'RUNNING':
      return { severity: 'info', text: 'Updating the API gateway…', retry: false };
    case 'PENDING_PROMOTION':
      return { severity: 'info', text: 'A visibility change for this environment applies with its next promotion.', retry: false };
    case 'FAILED':
    case 'DEGRADED': {
      const code = status.error || status.endpoints?.find((endpoint) => endpoint.error)?.error || '';
      const known = codedApiError({ code });
      const text = known || (code ? `The API gateway could not be updated (${code}).` : 'The API gateway could not be updated.');
      // A known code names something the user has to change (quota, where to deploy or edit), which
      // the same reconcile would only fail on again.
      return { severity: status.status === 'FAILED' ? 'error' : 'warning', text, retry: !known };
    }
    default:
      return null;
  }
}

/** Whether the reconciliation is still moving, so the deployment is worth polling. */
export const isProxyReconciliationActive = (status: ProxyReconciliationStatus | null | undefined): boolean => status?.status === 'PENDING' || status?.status === 'RUNNING';
