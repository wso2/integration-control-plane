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

import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { GitHub } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { AuthStatus } from '../../types/import';

interface GitHubAuthAreaProps {
  authStatus: AuthStatus;
  isCheckingAuth: boolean;
  isAuthenticated: boolean;
  onAuthorize: () => void;
  onInstall: () => void;
}

/**
 * GitHub OAuth status strip shown above the repo pickers: connection spinner, authorize /
 * reconnect / install-app buttons, and failure retry. Once authenticated it renders nothing —
 * the Organization field itself then carries the provider icon and reconnect action.
 */
export default function GitHubAuthArea({ authStatus, isCheckingAuth, isAuthenticated, onAuthorize, onInstall }: GitHubAuthAreaProps): JSX.Element | null {
  if (isCheckingAuth) {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3, minHeight: 40 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Checking GitHub connection…
        </Typography>
      </Stack>
    );
  }
  if (isAuthenticated) return null;
  if (authStatus === 'authenticating' || authStatus === 'installing') {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3, minHeight: 40 }}>
        <CircularProgress size={16} />
        <Typography color="text.secondary" variant="body2">
          {authStatus === 'installing' ? 'Install the GitHub App in the popup, then return here…' : 'Completing GitHub authorization…'}
        </Typography>
      </Stack>
    );
  }
  if (authStatus === 'failed') {
    return (
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="body2" color="error.main">
          GitHub authorization failed.
        </Typography>
        <Button variant="text" size="small" sx={{ p: 0, minWidth: 0 }} onClick={onAuthorize}>
          Try again
        </Button>
      </Stack>
    );
  }
  // Authorized, but the GitHub App is not installed on any account yet. The install
  // popup must open from this button's click — opening it from the token exchange gets popup-blocked.
  if (authStatus === 'needs-install') {
    return (
      <Box sx={{ mb: 3 }}>
        <Alert severity="info" sx={{ mb: 1.5 }}>
          The GitHub App is not installed on any of your accounts yet. Install it on the account or organization that owns your repository, then authorize again.
        </Alert>
        <Button
          variant="outlined"
          size="small"
          startIcon={
            <Box sx={{ color: 'text.primary', display: 'flex' }}>
              <GitHub size={16} />
            </Box>
          }
          onClick={onInstall}>
          Install GitHub App
        </Button>
      </Box>
    );
  }
  return (
    <Box sx={{ mb: 3 }}>
      {authStatus === 'done' && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          No repositories found. Please check your GitHub access.
        </Alert>
      )}
      <Button
        variant="outlined"
        size="small"
        startIcon={
          <Box sx={{ color: 'text.primary', display: 'flex' }}>
            <GitHub size={16} />
          </Box>
        }
        onClick={onAuthorize}>
        {authStatus === 'done' ? 'Reconnect GitHub' : 'Authorize with GitHub'}
      </Button>
    </Box>
  );
}
