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
 * The BFF's marketing consent record and its mapping to the domain type. Kept apart from
 * marketingConsent.ts, which imports the BFF client, so the e2e suite can apply the console's own
 * mapping without loading the client or auth.
 */

import type { ConsentStatus, MarketingConsent } from '../types/marketingConsent';

export interface BffMarketingConsent {
  optoutOfEmails?: boolean | null;
  consentStatus?: string | null;
}

const STATUSES: readonly ConsentStatus[] = ['No Opt-in', 'Unconfirmed', 'Confirmed', 'Unsubscribed'];

/**
 * platform-api already turns a null status into `No Opt-in` and a null opt-out into `false`; the same
 * defaults apply here so a change there cannot make the console ask a person who has answered. A
 * status outside the four is refused rather than guessed: the caller then shows no prompt.
 */
export function toMarketingConsent(wire: BffMarketingConsent): MarketingConsent {
  const raw = wire.consentStatus ?? 'No Opt-in';
  const consentStatus = STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
  if (!consentStatus) throw new Error(`Unknown marketing consent status: ${raw}`);
  return { optoutOfEmails: wire.optoutOfEmails ?? false, consentStatus };
}
