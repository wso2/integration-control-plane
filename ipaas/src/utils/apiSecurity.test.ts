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
import { TRACK_API_VERSION_MISSING, TRACK_API_VERSION_MISSING_NOTICE, endpointLoadNotice, friendlyApiError, userFacingError } from './apiSecurity';

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

  it('keeps the caller context for every 409 the BFF sends', () => {
    const notExposed = new BffError(409, JSON.stringify({ error: 'Conflict', message: 'endpoint is not exposed as an API yet' }));
    expect(friendlyApiError(notExposed, FALLBACK)).toBe(`${FALLBACK} The endpoint is not exposed as an API yet — expose it first.`);
    const versionMissing = new BffError(409, JSON.stringify({ error: 'Conflict', message: TRACK_API_VERSION_MISSING }));
    expect(friendlyApiError(versionMissing, FALLBACK)).toBe(`${FALLBACK} ${TRACK_API_VERSION_MISSING}.`);
    expect(friendlyApiError(new BffError(409, 'upstream conflict'), FALLBACK)).toContain('expose it first');
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

describe('endpointLoadNotice', () => {
  const copy = { notExposed: 'Not exposed yet.', unavailable: 'Unavailable.', readFailed: 'Could not read.' };

  it('tells a track without an API version to set one', () => {
    const err = new BffError(409, JSON.stringify({ error: 'Conflict', message: TRACK_API_VERSION_MISSING }));
    expect(endpointLoadNotice(err, copy)).toEqual({ text: TRACK_API_VERSION_MISSING_NOTICE, severity: 'info' });
  });

  it('keeps the caller copy for an endpoint not exposed yet', () => {
    const err = new BffError(409, JSON.stringify({ error: 'Conflict', message: 'endpoint is not exposed as an API yet' }));
    expect(endpointLoadNotice(err, copy)).toEqual({ text: 'Not exposed yet.', severity: 'info' });
  });
});
