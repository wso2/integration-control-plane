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
import type { JSX, ReactNode } from 'react';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import { tokenServiceUrlOf } from '../../../utils/voiceAgent';
import { VOICE_AGENT_BACKEND_SAMPLE, VOICE_AGENT_CLIENT_SAMPLE, VOICE_AGENT_TOKEN_RESPONSE, voiceAgentBackendEnv } from '../../../utils/voiceAgentConnect';
import CodeViewer from '../../CodeViewer';

const NOTES_SX = { m: 0, pl: 2.5 } as const;

interface HowToConnectDrawerProps {
  open: boolean;
  onClose: () => void;
  envName: string;
  componentId: string;
  versionId: string;
  releaseId: string;
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Stack gap={1.25}>
      <Typography variant="subtitle1" fontWeight={600}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

/**
 * How an application talks to the voice agent, after Devant's "Connect your application": a
 * backend fetches a LiveKit room token from the token service and the application joins the room.
 */
export default function HowToConnectDrawer({ open, onClose, envName, componentId, versionId, releaseId }: HowToConnectDrawerProps): JSX.Element {
  const { data: endpoints, isLoading, isError } = useEnvEndpoints(componentId, versionId, releaseId);
  const tokenServiceUrl = tokenServiceUrlOf(endpoints);

  return (
    <DrawerPanel open={open} onClose={onClose} width={720}>
      <DrawerPanel.Header>
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <DrawerPanel.Title>Connect your application</DrawerPanel.Title>
          <Typography variant="caption" color="text.secondary">
            {envName}
          </Typography>
        </Stack>
        <DrawerPanel.Actions>
          <DrawerPanel.ExpandButton expandLabel="Expand to full width" collapseLabel="Exit full width" />
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>
      <DrawerPanel.Body>
        {isLoading ? (
          <Stack gap={1.5}>
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="rounded" height={48} />
            <Skeleton variant="rounded" height={240} />
          </Stack>
        ) : isError ? (
          <Alert severity="error">Could not load the token service endpoint.</Alert>
        ) : !tokenServiceUrl ? (
          <Alert severity="info">The token service endpoint isn&apos;t deployed in {envName} yet.</Alert>
        ) : (
          <Stack gap={3.5}>
            <Typography variant="body2" color="text.secondary">
              Connect your application through a backend service: your backend calls this voice agent&apos;s token service and passes the result to your application, which joins the voice session directly. The application never needs the token service URL itself.
            </Typography>

            <Section title="Step 1: Set up your backend">
              <Typography variant="body2">Configure your backend with this voice agent&apos;s token service:</Typography>
              <CodeViewer language="text" showLineNumbers={false} wrapLongLines code={voiceAgentBackendEnv(tokenServiceUrl)} />
              <Typography variant="body2">The token service returns both the room token and the LiveKit server URL:</Typography>
              <CodeViewer language="text" showLineNumbers={false} showCopyButton={false} wrapLongLines code={VOICE_AGENT_TOKEN_RESPONSE} />
              <Typography variant="body2">
                Example Node.js server (<code>npm install express</code>):
              </Typography>
              <CodeViewer language="javascript" code={VOICE_AGENT_BACKEND_SAMPLE} maxHeight={360} />
            </Section>

            <Section title="Step 2: Connect your application">
              <Typography variant="body2">
                Fetch the room token from your backend and join the session (<code>npm install livekit-client @livekit/components-react</code>):
              </Typography>
              <CodeViewer language="javascript" code={VOICE_AGENT_CLIENT_SAMPLE} maxHeight={420} />
              <Typography variant="body2" color="text.secondary">
                Any LiveKit client SDK (web, iOS, Android, Flutter) can join the same way with the returned <code>url</code> and <code>token</code>. The voice agent also sends the conversation&apos;s transcript on the <code>voice-text</code> data topic.
              </Typography>
            </Section>

            <Section title="Security notes">
              <Alert severity="warning">The token service is public: anyone who has its URL can start calls that use your LiveKit and provider accounts. Keep it on your backend, and stop the voice agent when you are not using it.</Alert>
              <Box component="ul" sx={NOTES_SX}>
                <li>
                  <Typography variant="body2">Add authentication between your application and your backend before exposing it publicly.</Typography>
                </li>
                <li>
                  <Typography variant="body2">Restrict your backend&apos;s CORS allowed origins to your application&apos;s domains.</Typography>
                </li>
              </Box>
            </Section>
          </Stack>
        )}
      </DrawerPanel.Body>
    </DrawerPanel>
  );
}
