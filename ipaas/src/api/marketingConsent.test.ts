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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { bff } from './_client';
import { fetchMarketingConsent, recordMarketingConsent, toMarketingConsent } from './marketingConsent';

vi.mock('./_client', () => ({ bff: { get: vi.fn(), post: vi.fn() } }));
afterEach(() => vi.resetAllMocks());

describe('toMarketingConsent', () => {
  it('keeps a known status and the opt-out flag', () => {
    expect(toMarketingConsent({ optoutOfEmails: true, consentStatus: 'Confirmed' })).toEqual({ optoutOfEmails: true, consentStatus: 'Confirmed' });
  });

  it('reads a null or absent status as not answered, and a null opt-out as false', () => {
    expect(toMarketingConsent({ optoutOfEmails: null, consentStatus: null })).toEqual({ optoutOfEmails: false, consentStatus: 'No Opt-in' });
    expect(toMarketingConsent({})).toEqual({ optoutOfEmails: false, consentStatus: 'No Opt-in' });
  });

  it('matches a status regardless of case', () => {
    expect(toMarketingConsent({ consentStatus: 'no opt-in' }).consentStatus).toBe('No Opt-in');
    expect(toMarketingConsent({ consentStatus: 'UNSUBSCRIBED' }).consentStatus).toBe('Unsubscribed');
  });

  it('refuses a status it does not know rather than guessing', () => {
    expect(() => toMarketingConsent({ consentStatus: 'Pending' })).toThrow('Unknown marketing consent status');
  });
});

describe('marketing consent calls', () => {
  it('reads from /marketing-consent', async () => {
    vi.mocked(bff.get).mockResolvedValue({ optoutOfEmails: false, consentStatus: 'Unconfirmed' });
    expect(await fetchMarketingConsent()).toEqual({ optoutOfEmails: false, consentStatus: 'Unconfirmed' });
    expect(bff.get).toHaveBeenCalledWith('/marketing-consent');
  });

  it('records the decision in the body platform-api takes', async () => {
    vi.mocked(bff.post).mockResolvedValue(undefined);
    await recordMarketingConsent('Confirmed');
    expect(bff.post).toHaveBeenCalledWith('/marketing-consent', { consentstatus: 'Confirmed' });
  });
});
