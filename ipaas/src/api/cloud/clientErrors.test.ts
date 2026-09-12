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
 * Guards which BFF failures are quoted to the user.
 *
 * The Cloud Editor page used to wrap every API rejection in one generic string, so a
 * full editor quota — which the BFF explains, and which the user can fix by closing
 * an editor — reached them as "Unable to start the Cloud Editor", indistinguishable
 * from an outage. bffUserMessage decides what is safe to quote: 4xx messages are
 * about something the caller can change, 5xx messages name internal services and
 * must stay behind generic wording.
 */

import { describe, expect, it, vi } from 'vitest';

/**
 * Importing the API layer reaches src/features.ts via _client -> auth/tokenManager,
 * which reads the build-time __PRODUCT__ at module scope. Vite defines it; vitest
 * does not, so stub it before the imports are evaluated (see the note in
 * deploymentPipelines.test.ts).
 */
vi.hoisted(() => {
  (globalThis as unknown as { __PRODUCT__: string }).__PRODUCT__ = 'cloud';
});

import { BffError, bffUserMessage } from './_client';

const body = (obj: unknown) => JSON.stringify(obj);

describe('bffUserMessage', () => {
  it('quotes the message of a 4xx', () => {
    const err = new BffError(
      402,
      body({
        error: 'Payment Required',
        message: 'You have reached the Cloud Editor limit for your plan. Close an existing editor or upgrade your subscription.',
      }),
    );
    expect(bffUserMessage(err)).toBe(
      'You have reached the Cloud Editor limit for your plan. Close an existing editor or upgrade your subscription.',
    );
  });

  it('falls back to `error` when `message` is absent', () => {
    expect(bffUserMessage(new BffError(403, body({ error: 'Forbidden' })))).toBe('Forbidden');
  });

  // A 5xx message names internal services and gives the user nothing to act on.
  it('hides 5xx messages', () => {
    expect(bffUserMessage(new BffError(500, body({ message: 'failed to provision cloud editor' })))).toBeNull();
  });

  it('ignores non-BFF errors and non-JSON bodies', () => {
    expect(bffUserMessage(new Error('boom'))).toBeNull();
    expect(bffUserMessage('not an error')).toBeNull();
    // A gateway HTML error page, say — nothing safe to quote.
    expect(bffUserMessage(new BffError(504, '<html>Gateway Timeout</html>'))).toBeNull();
  });

  it('ignores empty and non-string message fields', () => {
    expect(bffUserMessage(new BffError(400, body({ message: '   ' })))).toBeNull();
    expect(bffUserMessage(new BffError(400, body({ message: 42 })))).toBeNull();
    expect(bffUserMessage(new BffError(400, body({})))).toBeNull();
  });
});
