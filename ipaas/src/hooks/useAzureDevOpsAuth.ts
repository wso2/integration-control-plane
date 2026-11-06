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

import { useEffect, useRef, useState } from 'react';
import { generateAndSaveAzureDevOpsState, validateAndClearAzureDevOpsState } from '../auth';
import { AZURE_DEVOPS_AUTH } from '../constants/azureDevOps';
import type { AuthStatus } from '../types/import';
import { useConnectAzureDevOps } from './useRepository';
import { Scopes } from '../constants/permissions';
import { useCan } from './useCan';

export interface UseAzureDevOpsAuthReturn {
  authStatus: AuthStatus;
  errorMessage: string;
  startAzureDevOpsAuth: (onSuccess?: () => void, selectAccount?: boolean) => void;
}

export function useAzureDevOpsAuth(initialStatus: AuthStatus = 'idle'): UseAzureDevOpsAuthReturn {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(initialStatus);
  const [errorMessage, setErrorMessage] = useState('');
  const connect = useConnectAzureDevOps();
  const canConnect = useCan()(Scopes.REPOSITORY_CONNECT);
  // Tears down the in-flight attempt's channel and timers. Held so that
  // unmounting, or starting another attempt, never leaves a poll running
  // against a closed popup or a channel that can still deliver a code.
  const disposeAttemptRef = useRef<(() => void) | null>(null);

  useEffect(() => () => disposeAttemptRef.current?.(), []);

  const startAzureDevOpsAuth = (onSuccess?: () => void, selectAccount = false): void => {
    const { azureDevOpsClientId, azureDevOpsRedirectUrl } = window.API_CONFIG;
    if (!azureDevOpsClientId || !canConnect) return;
    disposeAttemptRef.current?.();

    setAuthStatus('authenticating');
    setErrorMessage('');
    const state = generateAndSaveAzureDevOpsState();
    const params = new URLSearchParams({
      client_id: azureDevOpsClientId,
      response_type: 'code',
      redirect_uri: azureDevOpsRedirectUrl,
      response_mode: 'query',
      scope: AZURE_DEVOPS_AUTH.SCOPE,
      state,
    });
    if (selectAccount) params.set('prompt', 'select_account');

    // Subscribe before opening the popup so even an immediately completed
    // callback cannot post before this window is listening.
    const channel = new BroadcastChannel(AZURE_DEVOPS_AUTH.BROADCAST_CHANNEL);
    const popup = window.open(`${AZURE_DEVOPS_AUTH.AUTHORIZE_URL}?${params}`, 'azure-devops-oauth', AZURE_DEVOPS_AUTH.POPUP_DIMENSIONS);
    if (!popup) {
      channel.close();
      setErrorMessage('Please allow popups for this site and try again.');
      setAuthStatus('failed');
      return;
    }

    let completed = false;
    let popupCloseTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      completed = true;
      clearInterval(poll);
      clearTimeout(popupCloseTimer);
      channel.close();
      if (disposeAttemptRef.current === finish) disposeAttemptRef.current = null;
    };
    disposeAttemptRef.current = finish;
    const poll = setInterval(() => {
      if (!completed && popup.closed && !popupCloseTimer) {
        // The callback posts its result and then closes. Give the queued
        // BroadcastChannel message a chance to arrive before treating that
        // close as a cancellation.
        popupCloseTimer = setTimeout(() => {
          if (completed) return;
          finish();
          setErrorMessage('Azure DevOps connection was cancelled.');
          setAuthStatus('idle');
        }, AZURE_DEVOPS_AUTH.CALLBACK_DELIVERY_GRACE_MS);
      }
    }, AZURE_DEVOPS_AUTH.POPUP_POLL_INTERVAL_MS);

    channel.onmessage = async (event) => {
      const {
        authCode,
        state: returnedState,
        error,
        errorDescription,
      } = (event.data ?? {}) as {
        authCode?: string | null;
        state?: string | null;
        error?: string | null;
        errorDescription?: string | null;
      };
      // The channel is shared by tabs on this origin. A stale callback from a
      // different attempt must not terminate or clear this attempt's state.
      if (returnedState !== state) return;
      finish();
      if (!returnedState || !validateAndClearAzureDevOpsState(returnedState)) {
        setErrorMessage('Azure DevOps authorization failed because the returned state was invalid.');
        setAuthStatus('failed');
        return;
      }
      if (error || !authCode) {
        setErrorMessage(errorDescription || 'Microsoft authorization was not completed.');
        setAuthStatus('failed');
        return;
      }
      try {
        await connect.mutateAsync({ authorizationCode: authCode, redirectUri: azureDevOpsRedirectUrl });
        setAuthStatus('done');
        onSuccess?.();
      } catch {
        setErrorMessage('Failed to connect your Azure DevOps account. Please try again.');
        setAuthStatus('failed');
      }
    };
  };

  return { authStatus, errorMessage, startAzureDevOpsAuth };
}
