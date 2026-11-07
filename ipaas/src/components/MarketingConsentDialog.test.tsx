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

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketingConsentDialog from './MarketingConsentDialog';
import { BffError } from '../api/_client';
import { fetchMarketingConsent, recordMarketingConsent } from '../api/marketingConsent';
import { button, flush, renderWithScopes } from '../test/renderWithScopes';
import type { MarketingConsent } from '../types/marketingConsent';

vi.mock('../api/marketingConsent', () => ({ fetchMarketingConsent: vi.fn(), recordMarketingConsent: vi.fn() }));

const TITLE = 'Welcome to WSO2 Integration Platform!';
const unanswered: MarketingConsent = { optoutOfEmails: false, consentStatus: 'No Opt-in' };

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchMarketingConsent).mockResolvedValue(unanswered);
  vi.mocked(recordMarketingConsent).mockResolvedValue(undefined);
});

async function render() {
  const r = await renderWithScopes(<MarketingConsentDialog />, []);
  unmount = r.unmount;
  await flush();
  return r.container;
}

const shown = () => document.body.textContent?.includes(TITLE) ?? false;

describe('MarketingConsentDialog', () => {
  it('asks a person who has not answered, linking the privacy policy', async () => {
    await render();
    expect(shown()).toBe(true);
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent === 'privacy policy');
    expect(link?.getAttribute('href')).toBe('https://wso2.com/privacy-policy');
  });

  it.each<[string, MarketingConsent]>([
    ['who confirmed, in this or another console', { optoutOfEmails: false, consentStatus: 'Confirmed' }],
    ['who declined', { optoutOfEmails: false, consentStatus: 'Unsubscribed' }],
    ['who opted out of all WSO2 email', { optoutOfEmails: true, consentStatus: 'No Opt-in' }],
  ])('does not ask a person %s', async (_, consent) => {
    vi.mocked(fetchMarketingConsent).mockResolvedValue(consent);
    await render();
    expect(shown()).toBe(false);
  });

  it('shows nothing when consent is not configured in this environment', async () => {
    vi.mocked(fetchMarketingConsent).mockRejectedValue(new BffError(404, '{"error":"marketing consent is not configured in this environment"}'));
    await render();
    expect(shown()).toBe(false);
  });

  it.each([
    ['Confirm', 'Confirmed'],
    ['Decline', 'Unsubscribed'],
  ])('records %s as %s and closes without asking again', async (label, decision) => {
    const c = await render();
    await act(async () => button(c, label)!.click());
    await flush();
    expect(recordMarketingConsent).toHaveBeenCalledWith(decision, expect.anything());
    expect(shown()).toBe(false);
    // Pardot may not have the answer yet, so a read now could still say No Opt-in.
    expect(fetchMarketingConsent).toHaveBeenCalledTimes(1);
  });

  it('stays open with an error when the answer cannot be saved', async () => {
    vi.mocked(recordMarketingConsent).mockRejectedValue(new BffError(502, '{"error":"pardot unreachable"}'));
    const c = await render();
    await act(async () => button(c, 'Confirm')!.click());
    await flush();
    expect(shown()).toBe(true);
    expect(document.body.textContent).toContain('Could not save your choice');
    expect(button(c, 'Confirm')?.disabled).toBe(false);
  });
});
