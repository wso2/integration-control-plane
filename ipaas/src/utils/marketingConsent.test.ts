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

import { describe, expect, it } from 'vitest';
import { shouldAskMarketingConsent, withSessionAnswer } from './marketingConsent';
import type { ConsentStatus, MarketingConsent } from '../types/marketingConsent';

describe('shouldAskMarketingConsent', () => {
  it.each<[ConsentStatus, boolean]>([
    ['No Opt-in', true],
    ['Unconfirmed', true],
    ['Confirmed', false],
    ['Unsubscribed', false],
  ])('asks a person whose status is %s: %s', (consentStatus, ask) => {
    expect(shouldAskMarketingConsent({ optoutOfEmails: false, consentStatus })).toBe(ask);
  });

  it('never asks a person who opted out of all WSO2 email', () => {
    expect(shouldAskMarketingConsent({ optoutOfEmails: true, consentStatus: 'No Opt-in' })).toBe(false);
  });
});

describe('withSessionAnswer', () => {
  const read: MarketingConsent = { optoutOfEmails: false, consentStatus: 'No Opt-in' };

  it.each(['Confirmed', 'Unsubscribed'] as const)('takes %s saved in this session over a read Pardot has not caught up with', (saved) => {
    expect(withSessionAnswer(read, saved)).toEqual({ optoutOfEmails: false, consentStatus: saved });
  });

  it.each([null, '', 'No Opt-in', 'confirmed'])('keeps the read when the session holds %s', (saved) => {
    expect(withSessionAnswer(read, saved)).toBe(read);
  });
});
