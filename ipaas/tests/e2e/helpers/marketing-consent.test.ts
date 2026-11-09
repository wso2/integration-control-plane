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
import { expectsConsentPrompt } from './marketing-consent';

describe('expectsConsentPrompt', () => {
  it.each([
    ['No Opt-in', true],
    ['Unconfirmed', true],
    ['no opt-in', true],
    ['Confirmed', false],
    ['Unsubscribed', false],
  ])('for a person whose status is %s: %s', (consentStatus, ask) => {
    expect(expectsConsentPrompt(200, { optoutOfEmails: false, consentStatus })).toBe(ask);
  });

  it('asks a person with no recorded status, as the console reads it', () => {
    expect(expectsConsentPrompt(200, { optoutOfEmails: null, consentStatus: null })).toBe(true);
    expect(expectsConsentPrompt(200, {})).toBe(true);
  });

  it('expects no prompt for a status the console refuses', () => {
    expect(expectsConsentPrompt(200, { optoutOfEmails: false, consentStatus: 'Pending' })).toBe(false);
  });

  it('never asks a person who opted out of all WSO2 email', () => {
    expect(expectsConsentPrompt(200, { optoutOfEmails: true, consentStatus: 'No Opt-in' })).toBe(false);
  });

  it.each([403, 404, 502, 503])('expects no prompt when the read answers %s', (status) => {
    expect(expectsConsentPrompt(status, { optoutOfEmails: false, consentStatus: 'No Opt-in' })).toBe(false);
  });
});
