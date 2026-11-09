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
import { apiErrorMessage, httpStatusOf, isNotFoundError, isPermissionError, isQuotaError, isUnsupportedError, isUserPortalUnavailable } from './apiErrors';

describe('httpStatusOf', () => {
  it('prefers a structured status field over the message', () => {
    // BffError carries `status`; trust it rather than parsing the text.
    expect(httpStatusOf(Object.assign(new Error('HTTP 500: masked'), { status: 404 }))).toBe(404);
  });

  it('falls back to the message for errors without a status', () => {
    expect(httpStatusOf(new Error('GraphQL request failed (HTTP 404): nope'))).toBe(404);
    expect(httpStatusOf(new Error('HTTP 503: unavailable'))).toBe(503);
  });

  it('returns NaN when no status is present', () => {
    expect(httpStatusOf(new Error('Network request failed'))).toBeNaN();
    expect(httpStatusOf(null)).toBeNaN();
  });

  it('ignores a non-numeric status field', () => {
    expect(httpStatusOf(Object.assign(new Error('HTTP 404: x'), { status: 'nope' }))).toBe(404);
  });
});

describe('isNotFoundError', () => {
  it('matches an HTTP 404', () => {
    expect(isNotFoundError(new Error('HTTP 404 Not Found'))).toBe(true);
  });

  it('matches a BffError carrying status 404', () => {
    expect(isNotFoundError(Object.assign(new Error('HTTP 404: not found'), { status: 404 }))).toBe(true);
  });

  it('does not match other status codes', () => {
    expect(isNotFoundError(new Error('HTTP 500 Internal Server Error'))).toBe(false);
    expect(isNotFoundError(new Error('HTTP 4040 weird'))).toBe(false);
  });

  it('reads a bare message string as well as an Error', () => {
    expect(isNotFoundError('HTTP 404: not found')).toBe(true);
  });

  it('tolerates values carrying no status', () => {
    expect(isNotFoundError('nope')).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});

describe('isUnsupportedError', () => {
  it('matches the not-implemented stubs thrown by the cloud and icp API layers', () => {
    expect(isUnsupportedError(new Error('[cloud] executions.fetchRuntimeArguments: not implemented'))).toBe(true);
    expect(isUnsupportedError(new Error('[icp] governance.fetchPolicies: not implemented'))).toBe(true);
  });

  it('does not match a genuine server failure', () => {
    expect(isUnsupportedError(new Error('HTTP 500 failed to list execution history'))).toBe(false);
    expect(isUnsupportedError(new Error('Network request failed'))).toBe(false);
  });

  it('tolerates non-Error values', () => {
    expect(isUnsupportedError('not implemented')).toBe(false);
    expect(isUnsupportedError(null)).toBe(false);
  });
});

describe('isQuotaError', () => {
  it('matches a BffError carrying a 402 status', () => {
    expect(isQuotaError(Object.assign(new Error('You have reached the limit of 5 projects.'), { status: 402 }))).toBe(true);
  });

  it('matches the HTTP-prefixed message form', () => {
    expect(isQuotaError(new Error('HTTP 402: quota exceeded'))).toBe(true);
  });

  it('does not match other failures', () => {
    expect(isQuotaError(Object.assign(new Error('boom'), { status: 500 }))).toBe(false);
    expect(isQuotaError(Object.assign(new Error('nope'), { status: 409 }))).toBe(false);
    expect(isQuotaError(new Error('Failed to fetch'))).toBe(false);
  });

  it('tolerates non-Error values', () => {
    expect(isQuotaError('402')).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });
});

describe('apiErrorMessage', () => {
  const FALLBACK = 'Could not load traces for this agent.';

  it('shows the sentence the BFF wrote', () => {
    // The three outcomes the trace routes distinguish; each has to stay legible.
    const cases = [
      [503, 'Agent traces are not available in this deployment.'],
      [403, 'You are not permitted to read agent traces.'],
      [400, 'Traces are available only for AI agent components.'],
    ] as const;
    for (const [status, message] of cases) {
      expect(apiErrorMessage(Object.assign(new Error(message), { status }), FALLBACK)).toBe(message);
    }
  });

  it('falls back when the response carried no sentence of its own', () => {
    // What the client produces from a body it could not read a message out of.
    expect(apiErrorMessage(Object.assign(new Error('HTTP 502: <html>Bad Gateway</html>'), { status: 502 }), FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage(Object.assign(new Error('   '), { status: 500 }), FALLBACK)).toBe(FALLBACK);
  });

  it('falls back when there was no response at all', () => {
    // A dropped connection says nothing a reader can act on.
    expect(apiErrorMessage(new TypeError('Failed to fetch'), FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });
});

describe('isUserPortalUnavailable', () => {
  const answer = (status: number, code?: string) => Object.assign(new Error('refused'), { status, ...(code ? { code } : {}) });

  it('is a 404: the routes are off', () => {
    expect(isUserPortalUnavailable(answer(404))).toBe(true);
  });

  it('is a 503 that says the portal is not configured', () => {
    expect(isUserPortalUnavailable(answer(503, 'USER_PORTAL_NOT_CONFIGURED'))).toBe(true);
  });

  // A gateway restart answers 503 too; reading it as "no User Portal" would hide the Publish row.
  it('is not a 503 without that code', () => {
    expect(isUserPortalUnavailable(answer(503))).toBe(false);
  });

  it('is not another failure', () => {
    expect(isUserPortalUnavailable(answer(500))).toBe(false);
    expect(isUserPortalUnavailable(new Error('Network request failed'))).toBe(false);
  });
});

describe('isPermissionError', () => {
  const refusal = (status: number, body: string) => Object.assign(new Error('refused'), { status, body });

  it('is a 403 that names a missing scope', () => {
    expect(isPermissionError(refusal(403, '{"message":"insufficient permissions: requires ipaas:integration:deploy","code":"INSUFFICIENT_SCOPE","scope":"ipaas:integration:deploy"}'))).toBe(true);
  });

  it('is not another 403, such as a suspended subscription', () => {
    expect(isPermissionError(refusal(403, '{"code":"SUBSCRIPTION_SUSPENDED"}'))).toBe(false);
  });

  it('is not a 403 without a JSON body', () => {
    expect(isPermissionError(refusal(403, 'Forbidden'))).toBe(false);
  });

  it('is not another status', () => {
    expect(isPermissionError(refusal(400, '{"code":"INSUFFICIENT_SCOPE"}'))).toBe(false);
  });
});
