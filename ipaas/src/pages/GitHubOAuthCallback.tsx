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

import { Box, CircularProgress, Typography } from '@wso2/oxygen-ui';
import { useEffect, type JSX } from 'react';
import { GITHUB_AUTH } from '../constants/github';
import { IS_CLOUD } from '../features';
import { buildEditorCallbackUrl, editorCallbackUri, editorStateOrgId } from '../utils/vscodeCallback';

export default function GitHubOAuthCallback(): JSX.Element {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    // An editor cannot receive GitHub's redirect itself — a GitHub App has one
    // registered callback URL — so it puts its own URI in `state` and this page
    // forwards the result there. The BroadcastChannel below only reaches a
    // same-origin opener, which an editor's popup is not.
    const callbackUri = editorCallbackUri(state, window.API_CONFIG?.editorCallbackOrigins ?? []);
    if (callbackUri) {
      window.location.href = buildEditorCallbackUrl(callbackUri, {
        code,
        state,
        orgId: editorStateOrgId(state),
        installation_id: params.get('installation_id'),
        setup_action: params.get('setup_action'),
      });
      return;
    }

    const channel = new BroadcastChannel(GITHUB_AUTH.BROADCAST_CHANNEL);
    // Cloud only: installationId/setupAction are present when GitHub redirects
    // here after a GitHub App installation (App "Setup URL" pointed at /ghapp).
    // Other variants post the original { authCode, state } shape untouched.
    channel.postMessage({
      authCode: code ?? null,
      state: state ?? null,
      ...(IS_CLOUD ? { installationId: params.get('installation_id'), setupAction: params.get('setup_action') } : {}),
    });
    channel.close();
    window.close();
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
      <CircularProgress size={32} />
      <Typography color="text.secondary">Completing GitHub authentication…</Typography>
    </Box>
  );
}
