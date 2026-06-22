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

import { useState } from 'react';
import { useObtainGithubToken } from './useRepository';
import { GITHUB_AUTH } from '../constants/github';
import { buildGitHubOAuthUrl } from '../paths';
import { generateAndSaveGitHubState, validateAndClearGitHubState } from '../auth/oauthState';
import type { AuthStatus } from '../types/import';

export interface UseGitHubAuthReturn {
  authStatus: AuthStatus;
  /** Opens the GitHub OAuth popup. `onSuccess` is called when the token exchange succeeds. */
  startGitHubAuth: (onSuccess?: () => void) => void;
  /** Exchanges a raw OAuth auth code for a token (used when code arrives via location state). */
  exchangeAuthCode: (code: string) => Promise<void>;
}

export function useGitHubAuth(initialStatus: AuthStatus = 'idle'): UseGitHubAuthReturn {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(initialStatus);
  const obtainToken = useObtainGithubToken();

  const exchangeAuthCode = async (code: string): Promise<void> => {
    try {
      const result = await obtainToken.mutateAsync(code);
      setAuthStatus(result.success ? 'done' : 'failed');
    } catch {
      setAuthStatus('failed');
    }
  };

  const startGitHubAuth = (onSuccess?: () => void): void => {
    const { githubAppClientId, githubAppAuthRedirectUrl } = window.API_CONFIG;
    if (!githubAppClientId) return;
    setAuthStatus('authenticating');
    const state = generateAndSaveGitHubState();
    const url = buildGitHubOAuthUrl(githubAppAuthRedirectUrl ?? '', githubAppClientId, state);
    const popup = window.open(url, 'github-oauth', GITHUB_AUTH.POPUP_DIMENSIONS);
    const channel = new BroadcastChannel(GITHUB_AUTH.BROADCAST_CHANNEL);
    const pollClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(pollClosed);
        channel.close();
        setAuthStatus((prev) => (prev === 'authenticating' ? 'idle' : prev));
      }
    }, GITHUB_AUTH.POPUP_POLL_INTERVAL_MS);
    channel.onmessage = async (event) => {
      clearInterval(pollClosed);
      channel.close();
      const { authCode, state: returnedState } = event.data as { authCode: string | null; state: string | null };
      if (!returnedState || !validateAndClearGitHubState(returnedState)) {
        setAuthStatus('failed');
        return;
      }
      if (!authCode) {
        setAuthStatus('failed');
        return;
      }
      try {
        const result = await obtainToken.mutateAsync(authCode);
        if (result.success) {
          setAuthStatus('done');
          onSuccess?.();
        } else {
          setAuthStatus('failed');
        }
      } catch {
        setAuthStatus('failed');
      }
    };
  };

  return { authStatus, startGitHubAuth, exchangeAuthCode };
}
