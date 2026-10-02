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
import { buildGitHubAppInstallUrl, buildGitHubOAuthUrl } from '../paths';
import { generateAndSaveGitHubState, validateAndClearGitHubState } from '#auth';
import { IS_CLOUD } from '../features';
import type { AuthStatus } from '../types/import';

export interface UseGitHubAuthReturn {
  authStatus: AuthStatus;
  /** Opens the GitHub OAuth popup. `onSuccess` is called when the token exchange succeeds. */
  startGitHubAuth: (onSuccess?: () => void) => void;
  /** Exchanges a raw OAuth auth code for a token (used when code arrives via location state). */
  exchangeAuthCode: (code: string) => Promise<void>;
  /**
   * Opens the GitHub App installation page in a popup. Must be called from a
   * button click (a fresh user gesture) — popups opened after an async
   * exchange are blocked by the browser. `onClosed` fires when the popup
   * closes; the user then authorizes again to bind the new installation.
   */
  startGitHubAppInstall: (onClosed?: () => void) => void;
  /**
   * Opens an arbitrary GitHub URL (App install/manage page, new-repo page) in
   * a popup and calls `onClosed` once it closes. Backs the org/repo dropdown
   * "Add organization" / "Connect more repositories" / "Create repository"
   * actions — the user grants access (or creates a repo) on GitHub, then the
   * caller refetches the repo list. Not product-gated.
   */
  openGitHubManage: (url: string, onClosed?: () => void) => void;
  /** GitHub App installation URL for the configured App, or '' when no slug is configured. */
  githubInstallUrl: string;
}

export function useGitHubAuth(initialStatus: AuthStatus = 'idle'): UseGitHubAuthReturn {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(initialStatus);
  const obtainToken = useObtainGithubToken();

  // Cloud GitHub-App flow: the user authorized the App but has not installed
  // it on any account (exchange returns needsInstallation, a bind 409 —
  // git-app-service persists nothing in that case). We only flag the state
  // here; the install popup must be opened by startGitHubAppInstall from a
  // fresh button click — a window.open at this point runs after the async
  // exchange, outside the user-activation window, and gets popup-blocked.
  const handleExchangeResult = (result: { success: boolean; needsInstallation?: boolean }, onSuccess?: () => void): void => {
    if (result.success) {
      setAuthStatus('done');
      onSuccess?.();
      return;
    }
    if (IS_CLOUD && result.needsInstallation && window.API_CONFIG.githubAppSlug) {
      setAuthStatus('needs-install');
      return;
    }
    setAuthStatus('failed');
  };

  const startGitHubAppInstall = (onClosed?: () => void): void => {
    const slug = window.API_CONFIG.githubAppSlug;
    if (!IS_CLOUD || !slug) return;
    const popup = window.open(buildGitHubAppInstallUrl(slug), 'github-app-install', GITHUB_AUTH.POPUP_DIMENSIONS);
    if (!popup) {
      // Popup blocked: keep the Install CTA on screen so the user can allow
      // pop-ups and retry, rather than bouncing back to a failed state.
      setAuthStatus('needs-install');
      return;
    }
    setAuthStatus('installing');
    // Finish on either signal — the popup closing (reliable everywhere), or
    // /ghapp posting the install redirect params (only when the App's Setup
    // URL points at this console). On finish, drop back to idle so the
    // Authorize button re-renders: the earlier bind persisted nothing, so the
    // user re-authorizes (instant redirect — already authorized) and the
    // fresh code binds the new installation. Never chain the authorize popup
    // from here.
    const channel = new BroadcastChannel(GITHUB_AUTH.BROADCAST_CHANNEL);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      channel.close();
      clearInterval(poll);
      setAuthStatus('idle');
      onClosed?.();
    };
    channel.onmessage = (event) => {
      const { installationId, setupAction } = (event.data ?? {}) as { installationId?: string | null; setupAction?: string | null };
      if (installationId || setupAction) finish();
    };
    const poll = setInterval(() => {
      if (popup.closed) finish();
    }, GITHUB_AUTH.POPUP_POLL_INTERVAL_MS);
  };

  const openGitHubManage = (url: string, onClosed?: () => void): void => {
    if (!url) return;
    const popup = window.open(url, 'github-manage', GITHUB_AUTH.POPUP_DIMENSIONS);
    if (!popup) return;
    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll);
        onClosed?.();
      }
    }, GITHUB_AUTH.POPUP_POLL_INTERVAL_MS);
  };

  const exchangeAuthCode = async (code: string): Promise<void> => {
    try {
      const result = await obtainToken.mutateAsync(code);
      handleExchangeResult(result);
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
        handleExchangeResult(result, onSuccess);
      } catch {
        setAuthStatus('failed');
      }
    };
  };

  const githubInstallUrl = window.API_CONFIG.githubAppSlug ? buildGitHubAppInstallUrl(window.API_CONFIG.githubAppSlug) : '';

  return { authStatus, startGitHubAuth, exchangeAuthCode, startGitHubAppInstall, openGitHubManage, githubInstallUrl };
}
