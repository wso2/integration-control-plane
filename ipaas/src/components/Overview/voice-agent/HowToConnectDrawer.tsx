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

import { Alert, Box, DrawerPanel, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import { tokenServiceUrlOf } from '../../../utils/voiceAgent';
import CodeViewer from '../../CodeViewer';
import CopyButton from '../integration-as-api/CopyButton';

const URL_ROW_SX = { display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' } as const;
const URL_TEXT_SX = { fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 } as const;

interface HowToConnectDrawerProps {
  open: boolean;
  onClose: () => void;
  envName: string;
  componentId: string;
  versionId: string;
  releaseId: string;
}

/** How an app talks to the voice agent: fetch a LiveKit room token from its token service, then join the room. */
export default function HowToConnectDrawer({ open, onClose, envName, componentId, versionId, releaseId }: HowToConnectDrawerProps): JSX.Element {
  const { data: endpoints, isLoading, isError } = useEnvEndpoints(componentId, versionId, releaseId);
  const tokenServiceUrl = tokenServiceUrlOf(endpoints);

  return (
    <DrawerPanel open={open} onClose={onClose} width={560}>
      <DrawerPanel.Header>
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <DrawerPanel.Title>How to connect</DrawerPanel.Title>
          <Typography variant="caption" color="text.secondary">
            {envName}
          </Typography>
        </Stack>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>
      <DrawerPanel.Body>
        {isLoading ? (
          <Stack gap={1.5}>
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="rounded" height={48} />
            <Skeleton variant="rounded" height={160} />
          </Stack>
        ) : isError ? (
          <Alert severity="error">Could not load the token service endpoint.</Alert>
        ) : !tokenServiceUrl ? (
          <Alert severity="info">The token service endpoint isn&apos;t deployed in {envName} yet.</Alert>
        ) : (
          <Stack gap={3}>
            <Stack gap={1}>
              <Typography variant="subtitle2">Token service</Typography>
              <Box sx={URL_ROW_SX}>
                <Typography variant="body2" sx={URL_TEXT_SX}>
                  {tokenServiceUrl}
                </Typography>
                <CopyButton value={tokenServiceUrl} label="Copy URL" />
              </Box>
            </Stack>
            <Stack gap={1}>
              <Typography variant="subtitle2">1. Get a room token</Typography>
              <Typography variant="body2" color="text.secondary">
                Your app asks the token service above for a LiveKit room token. Use one room per conversation.
              </Typography>
              <CodeViewer language="text" showLineNumbers={false} wrapLongLines code="GET /getToken?roomName=<room>&participantName=<caller>" />
              <CodeViewer language="json" showLineNumbers={false} code={'{ "token": "<LiveKit room token>", "url": "<LiveKit URL>" }'} />
            </Stack>
            <Stack gap={1}>
              <Typography variant="subtitle2">2. Join the room</Typography>
              <Typography variant="body2" color="text.secondary">
                Connect to <code>url</code> with <code>token</code> using a LiveKit client SDK and publish the caller&apos;s microphone. The voice agent joins the room, answers out loud, and sends the transcript on the <code>voice-text</code> data topic.
              </Typography>
            </Stack>
            <Alert severity="warning">This URL is public: anyone who has it can start calls that use your LiveKit and provider accounts. Share it only with apps you trust, and stop the voice agent when you are not using it.</Alert>
          </Stack>
        )}
      </DrawerPanel.Body>
    </DrawerPanel>
  );
}
