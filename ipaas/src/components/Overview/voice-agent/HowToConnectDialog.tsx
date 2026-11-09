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

import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import { tokenServiceUrlOf } from '../../../utils/voiceAgent';
import { VOICE_AGENT_BACKEND_SAMPLE, VOICE_AGENT_CLIENT_SAMPLE, VOICE_AGENT_TOKEN_RESPONSE, voiceAgentBackendEnv } from '../../../utils/voiceAgentConnect';
import CodeViewer from '../../CodeViewer';

const NOTES_SX = { m: 0, pl: 2.5 } as const;
const TITLE_SX = { display: 'flex', alignItems: 'center', gap: 1, pr: 1.5 } as const;

interface HowToConnectDialogProps {
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

export default function HowToConnectDialog({ open, onClose, envName, componentId, versionId, releaseId }: HowToConnectDialogProps): JSX.Element {
  const { data: endpoints, isLoading, isError, refetch } = useEnvEndpoints(componentId, versionId, releaseId);
  const tokenServiceUrl = tokenServiceUrlOf(endpoints);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={TITLE_SX}>
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6">Connect your application</Typography>
          <Typography variant="caption" color="text.secondary">
            {envName}
          </Typography>
        </Stack>
        <Tooltip title="Close">
          <IconButton aria-label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers>
        {isLoading ? (
          <Stack gap={1.5}>
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="rounded" height={48} />
            <Skeleton variant="rounded" height={240} />
          </Stack>
        ) : isError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }>
            Couldn&apos;t load the token service endpoint.
          </Alert>
        ) : !tokenServiceUrl ? (
          <Alert severity="info">The token service isn&apos;t deployed in {envName} yet.</Alert>
        ) : (
          <Stack gap={3.5}>
            <Typography variant="body2" color="text.secondary">
              Your application connects to this voice agent through your own backend. The backend requests a room token from the voice agent&apos;s token service and returns it to the application, which then joins the voice session directly. This keeps the
              token service URL out of your application.
            </Typography>

            <Section title="Step 1: Set up your backend">
              <Typography variant="body2">Add the token service URL to your backend&apos;s environment variables.</Typography>
              <CodeViewer language="bash" showLineNumbers={false} code={voiceAgentBackendEnv(tokenServiceUrl)} />
              <Typography variant="body2">The token service responds with a room token and the LiveKit server URL.</Typography>
              <CodeViewer language="json" showLineNumbers={false} showCopyButton={false} code={VOICE_AGENT_TOKEN_RESPONSE} />
              <Typography variant="body2">
                The following Node.js example forwards token requests to the voice agent. Install its dependency with <code>npm install express</code>.
              </Typography>
              <CodeViewer language="javascript" showLineNumbers={false} code={VOICE_AGENT_BACKEND_SAMPLE} maxHeight={360} />
            </Section>

            <Section title="Step 2: Connect your application">
              <Typography variant="body2">
                Request a room token from your backend, then use it to join the voice session. The following React example requires <code>npm install livekit-client @livekit/components-react</code>.
              </Typography>
              <CodeViewer language="jsx" showLineNumbers={false} code={VOICE_AGENT_CLIENT_SAMPLE} maxHeight={420} />
              <Typography variant="body2" color="text.secondary">
                You can also join from any other LiveKit client SDK, such as iOS, Android or Flutter, using the returned <code>url</code> and <code>token</code>. The voice agent publishes the conversation transcript on the <code>voice-text</code> data topic.
              </Typography>
            </Section>

            <Section title="Security considerations">
              <Alert severity="warning">The token service is publicly accessible. Anyone with its URL can start calls that consume your LiveKit and speech provider quotas. Call it only from your backend, and stop the voice agent when it is not in use.</Alert>
              <Box component="ul" sx={NOTES_SX}>
                <li>
                  <Typography variant="body2">Authenticate requests between your application and your backend before you make it publicly available.</Typography>
                </li>
                <li>
                  <Typography variant="body2">Limit your backend&apos;s CORS allowed origins to your application&apos;s domains.</Typography>
                </li>
              </Box>
            </Section>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
