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
import { BffError } from '../api/_client';
import { endpointLoadNotice, friendlyApiError, readOnlyApiSettingsNotice, userFacingError } from './apiSecurity';

const FALLBACK = 'Failed to save the security configuration.';

describe('friendlyApiError', () => {
  it('never leaks the raw HTTP body', () => {
    const message = friendlyApiError(new Error('HTTP 404: 404 page not found'), FALLBACK);
    expect(message).not.toContain('404 page not found');
    expect(message).not.toContain('HTTP');
  });

  it('explains a 404 as an unexposed endpoint', () => {
    expect(friendlyApiError(new Error('HTTP 404: 404 page not found'), FALLBACK)).toBe(`${FALLBACK} This endpoint is not exposed as an API on the gateway yet.`);
  });

  it('explains a 409 as a missing exposure', () => {
    expect(friendlyApiError(new Error('HTTP 409: not deployed'), FALLBACK)).toContain('expose it first');
  });

  it('maps auth statuses without the caller context', () => {
    expect(friendlyApiError(new Error('HTTP 401: unauthorized'), FALLBACK)).toBe('Your session has expired. Sign in again and retry.');
    expect(friendlyApiError(new Error('HTTP 403: forbidden'), FALLBACK)).toContain('do not have permission');
  });

  it('maps 503 and other 5xx separately', () => {
    expect(friendlyApiError(new Error('HTTP 503: upstream down'), FALLBACK)).toContain('gateway is unavailable');
    expect(friendlyApiError(new Error('HTTP 500: boom'), FALLBACK)).toBe('Something went wrong on the server. Try again in a moment.');
  });

  it('recognises a failed fetch', () => {
    expect(friendlyApiError(new TypeError('Failed to fetch'), FALLBACK)).toContain('Could not reach the server');
  });

  it('passes a user-facing message through instead of the fallback', () => {
    const err = userFacingError('The old key was revoked but a new one could not be issued.', new Error('HTTP 500: boom'));
    expect(friendlyApiError(err, FALLBACK)).toBe('The old key was revoked but a new one could not be issued.');
    expect(err.cause).toBeInstanceOf(Error);
  });

  it('falls back for unrecognised errors and non-errors', () => {
    expect(friendlyApiError(new Error('something odd'), FALLBACK)).toBe(FALLBACK);
    expect(friendlyApiError(undefined, FALLBACK)).toBe(FALLBACK);
    expect(friendlyApiError('HTTP 400: bad body', FALLBACK)).toContain('check the values');
  });
});

const bffError = (status: number, body: object) => new BffError(status, JSON.stringify(body));

describe('coded BFF errors', () => {
  it.each([
    { name: 'quota', error: bffError(402, { code: 'APIP_QUOTA_EXCEEDED', message: 'quota_exceeded: apis' }), want: 'reached its API limit' },
    { name: 'entry environment', error: bffError(409, { code: 'CHANGE_REQUIRES_ENTRY_ENVIRONMENT', entryEnvironment: 'development' }), want: 'Make the change in development, then promote.' },
    { name: 'target parameter', error: bffError(409, { code: 'APIP_TARGET_PARAMETER_CHANGE_UNSUPPORTED', entryEnvironment: 'development' }), want: 'Make the change in development' },
    { name: 'no source build', error: bffError(409, { code: 'APIP_SOURCE_BUILD_UNAVAILABLE', sourceEnvironment: 'development' }), want: 'development isn’t running this release’s API' },
  ])('words $name by its code, not its status', ({ error, want }) => {
    expect(friendlyApiError(error, FALLBACK)).toContain(want);
    expect(endpointLoadNotice(error, { notExposed: 'not exposed', unavailable: 'unavailable', readFailed: 'read failed' })?.text).toContain(want);
  });

  it('keeps the not-exposed wording for a 409 without a code', () => {
    const error = bffError(409, { message: 'endpoint is not exposed as an API yet' });
    expect(friendlyApiError(error, FALLBACK)).toContain('expose it first');
    expect(endpointLoadNotice(error, { notExposed: 'not exposed', unavailable: 'unavailable', readFailed: 'read failed' })).toEqual({ text: 'not exposed', severity: 'info' });
  });
});

describe('readOnlyApiSettingsNotice', () => {
  it('is null where the settings can change, including on BFFs that predate the flag', () => {
    expect(readOnlyApiSettingsNotice({ editable: true })).toBeNull();
    expect(readOnlyApiSettingsNotice({})).toBeNull();
    expect(readOnlyApiSettingsNotice(undefined)).toBeNull();
  });

  it('names the entry environment outside it', () => {
    expect(readOnlyApiSettingsNotice({ editable: false, entryEnvironment: 'development' })).toBe('Managed in development. Change it there, then promote to apply it here.');
  });

  it('says the state is unknown on a build that predates recorded settings', () => {
    expect(readOnlyApiSettingsNotice({ editable: false, entryEnvironment: 'development', stateUnknown: true })).toContain('can’t be shown');
  });
});
