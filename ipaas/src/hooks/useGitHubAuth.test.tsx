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

import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn());
vi.mock('../services/telemetry/consoleActions', async (importOriginal) => ({ ...(await importOriginal<object>()), trackConsoleAction: track }));
const exchange = vi.hoisted(() => vi.fn());
vi.mock('./useRepository', () => ({ useObtainGithubToken: () => ({ mutateAsync: exchange }) }));
vi.mock('./useCan', () => ({ useCan: () => () => true }));
vi.mock('../auth', () => ({ generateAndSaveGitHubState: () => 'st', validateAndClearGitHubState: (s: string) => s === 'st' }));

import { ConsoleAction } from '../services/telemetry/consoleActions';
import { useGitHubAuth, type UseGitHubAuthReturn } from './useGitHubAuth';

// The channel the hook opens, so a test can deliver the callback page's message.
class FakeChannel {
  static last: FakeChannel | undefined;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor() {
    FakeChannel.last = this;
  }
  close() {}
}

let auth: UseGitHubAuthReturn;
let popup: { closed: boolean };
let unmount: () => void = () => {};

function Harness(): ReactNode {
  auth = useGitHubAuth();
  return null;
}

const outcomes = () => track.mock.calls.filter(([name]) => name === ConsoleAction.GitAuthorization).map(([, dims]) => (dims as { outcome: string }).outcome);
const answer = (data: object) => act(async () => FakeChannel.last?.onmessage?.({ data }));

beforeEach(async () => {
  vi.useFakeTimers();
  track.mockClear();
  exchange.mockReset();
  popup = { closed: false };
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  vi.spyOn(window, 'open').mockImplementation(() => popup as Window);
  (window as unknown as { API_CONFIG: object }).API_CONFIG = { githubAppClientId: 'client', githubAppAuthRedirectUrl: 'https://console/ghapp', githubAppSlug: 'app' };
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
  unmount = () => act(() => root.unmount());
});
afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useGitHubAuth authorization outcomes', () => {
  it('reports completed when the callback answers just after the popup closes', async () => {
    exchange.mockResolvedValue({ success: true });
    act(() => auth.startGitHubAuth());
    popup.closed = true;
    await act(async () => vi.advanceTimersByTime(500));
    await answer({ authCode: 'code', state: 'st' });
    await act(async () => vi.advanceTimersByTime(5000));
    expect(outcomes()).toEqual(['started', 'completed']);
  });

  it('reports cancelled when the popup closes without an answer', async () => {
    act(() => auth.startGitHubAuth());
    popup.closed = true;
    await act(async () => vi.advanceTimersByTime(1000));
    expect(outcomes()).toEqual(['started', 'cancelled']);
  });

  it('reports cancelled when the user declines on GitHub, and failed for another error', async () => {
    act(() => auth.startGitHubAuth());
    await answer({ authCode: null, state: 'st', error: 'access_denied' });
    act(() => auth.startGitHubAuth());
    await answer({ authCode: null, state: 'st', error: 'server_error' });
    expect(outcomes()).toEqual(['started', 'cancelled', 'started', 'failed']);
  });

  it('reports needs-install when the App is authorized but not installed', async () => {
    exchange.mockResolvedValue({ success: false, needsInstallation: true });
    await act(async () => auth.exchangeAuthCode('code'));
    expect(outcomes()).toEqual(['needs-install']);
    expect(auth.authStatus).toBe('needs-install');
  });
});
