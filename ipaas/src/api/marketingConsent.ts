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
 * Marketing consent, through ipaas-service's GET and POST /marketing-consent. ipaas-service forwards
 * the caller's own token to platform-api, which reads and records consent against the token's email.
 */

import { bff } from './_client';
import { toMarketingConsent, type BffMarketingConsent } from './_marketingConsentShape';
import type { ConsentDecision, MarketingConsent } from '../types/marketingConsent';

export { toMarketingConsent };

const PATH = '/marketing-consent';

export const fetchMarketingConsent = async (): Promise<MarketingConsent> => toMarketingConsent(await bff.get<BffMarketingConsent>(PATH));

/** Accepted (202) means recorded, not yet delivered: Pardot is updated after the reply. */
export const recordMarketingConsent = (decision: ConsentDecision): Promise<void> => bff.post<void>(PATH, { consentstatus: decision });
