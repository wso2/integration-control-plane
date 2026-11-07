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

import type { MarketingConsent } from '../types/marketingConsent';

/**
 * Whether to ask a person for marketing consent: only when they have not answered anywhere in WSO2
 * Cloud, and have not opted out of all WSO2 email.
 */
export function shouldAskMarketingConsent(consent: MarketingConsent): boolean {
  if (consent.optoutOfEmails) return false;
  return consent.consentStatus === 'No Opt-in' || consent.consentStatus === 'Unconfirmed';
}
