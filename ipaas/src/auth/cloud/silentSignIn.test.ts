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
import { isSilentSignInFrame, relaySilentSignIn, silentSignInMessage } from './silentSignIn';

// jsdom keeps frameElement off the window object, so a test defines its own.
function stubFrameElement(get: () => Element | null): void {
  Object.defineProperty(window, 'frameElement', { configurable: true, get });
}

function inFrame(id: string): ReturnType<typeof vi.fn> {
  const postMessage = vi.fn();
  vi.spyOn(window, 'top', 'get').mockReturnValue({ postMessage } as unknown as Window);
  stubFrameElement(() => Object.assign(document.createElement('iframe'), { id }));
  return postMessage;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { frameElement?: unknown }).frameElement;
  window.history.replaceState({}, '', '/');
});

describe('silentSignInMessage', () => {
  it('hands on the code, session state and state Thunder returned', () => {
    const params = new URLSearchParams({ code: 'abc', session_state: 'ss', state: 'instance_0_request_1' });
    expect(silentSignInMessage(params)).toEqual({ type: 'check_session_signed_in', data: { code: 'abc', sessionState: 'ss', state: 'instance_0_request_1' } });
  });

  it('reports no session for login_required and the like', () => {
    expect(silentSignInMessage(new URLSearchParams({ error: 'login_required', state: 'instance_0_request_1' }))).toEqual({ type: 'check_session_signed_out' });
  });
});

describe('relaySilentSignIn', () => {
  it('does nothing in a top-level window', () => {
    expect(isSilentSignInFrame()).toBe(false);
    expect(relaySilentSignIn()).toBe(false);
  });

  it('does nothing in a frame that is not the SDK’s', () => {
    const postMessage = inFrame('someone-else');
    expect(relaySilentSignIn()).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('posts Thunder’s answer to the console, on its own origin only', () => {
    window.history.replaceState({}, '', '/signin?code=abc&state=instance_0_request_1');
    const postMessage = inFrame('promptNoneIFrame');
    expect(relaySilentSignIn()).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'check_session_signed_in', data: { code: 'abc', sessionState: '', state: 'instance_0_request_1' } }, window.location.origin);
  });

  it('treats a cross-origin parent as not the SDK’s frame', () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    stubFrameElement(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    expect(isSilentSignInFrame()).toBe(false);
  });
});
