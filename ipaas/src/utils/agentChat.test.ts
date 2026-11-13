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
import { CHAT_UNREACHABLE, chatNotReady, chatRequestFailure, chatResponseFailure } from './agentChat';

describe('chatRequestFailure', () => {
  // Each browser words a failed fetch differently; all reject with a TypeError.
  it.each(['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])('reads a network failure (%s) as an unreachable gateway, not an inactive agent', (message) => {
    expect(chatRequestFailure(new TypeError(message))).toBe(CHAT_UNREACHABLE);
  });

  it('passes any other failure through', () => {
    expect(chatRequestFailure(new Error('aborted'))).toBe('Failed to connect: aborted');
    expect(chatRequestFailure('boom')).toBe('Failed to connect: boom');
  });
});

describe('chatResponseFailure', () => {
  it.each([502, 503, 504])('reads %i as an agent that is not ready yet', (status) => {
    expect(chatResponseFailure(status, '')).toBe(chatNotReady(status));
  });

  it('shows other statuses as they are, without a dangling space when HTTP/2 sends no status text', () => {
    expect(chatResponseFailure(500, 'Internal Server Error')).toBe('HTTP 500 Internal Server Error');
    expect(chatResponseFailure(404, '')).toBe('HTTP 404');
  });
});
