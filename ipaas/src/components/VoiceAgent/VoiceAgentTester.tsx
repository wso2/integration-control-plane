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

import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@wso2/oxygen-ui';
import { Mic, PhoneOff } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useVoiceTesterSession, type VoiceTesterStatus } from '../../hooks/useVoiceTesterSession';

const STATUS_LABEL: Record<VoiceTesterStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting',
  connected: 'Live',
  error: 'Failed',
};

const STATUS_COLOR: Record<VoiceTesterStatus, 'default' | 'warning' | 'success' | 'error'> = {
  idle: 'default',
  connecting: 'warning',
  connected: 'success',
  error: 'error',
};

const TRANSCRIPT_SX = { maxHeight: 280, overflowY: 'auto', p: 2 } as const;
const HIDDEN_SX = { display: 'none' } as const;

interface VoiceAgentTesterProps {
  tokenServiceUrl: string;
  /** The deployment is not serving, so a call cannot reach the worker. */
  disabled: boolean;
}

/** Talk to the deployed voice agent from the browser, with a live transcript of both sides. */
export default function VoiceAgentTester({ tokenServiceUrl, disabled }: VoiceAgentTesterProps): JSX.Element {
  const { status, error, transcript, start, stop, audioContainerRef } = useVoiceTesterSession(tokenServiceUrl);
  const inCall = status === 'connecting' || status === 'connected';

  return (
    <Stack gap={1.5}>
      <Stack direction="row" alignItems="center" gap={1.5}>
        <Typography variant="subtitle2">Try it</Typography>
        <Chip size="small" label={STATUS_LABEL[status]} color={STATUS_COLOR[status]} />
        <Box sx={{ flex: 1 }} />
        {inCall ? (
          <Button variant="outlined" color="error" size="small" startIcon={<PhoneOff size={14} />} onClick={stop}>
            End call
          </Button>
        ) : (
          <Button variant="contained" size="small" startIcon={<Mic size={14} />} onClick={start} disabled={disabled}>
            Start call
          </Button>
        )}
      </Stack>
      {disabled && !inCall && (
        <Typography variant="caption" color="text.secondary">
          Start the voice agent to try it.
        </Typography>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {(inCall || transcript.length > 0) && (
        <Paper variant="outlined" sx={TRANSCRIPT_SX}>
          {transcript.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {status === 'connected' ? 'Say something. The conversation appears here.' : 'Connecting to the voice agent.'}
            </Typography>
          ) : (
            <Stack gap={1}>
              {transcript.map((m) => (
                <Box key={m.id}>
                  <Typography variant="caption" color="text.secondary">
                    {m.role === 'user' ? 'You' : 'Agent'}
                    {m.interrupted ? ' (interrupted)' : ''}
                  </Typography>
                  <Typography variant="body2">{m.text}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      )}
      {/* The agent's audio plays from elements LiveKit attaches here. */}
      <Box ref={audioContainerRef} sx={HIDDEN_SX} />
    </Stack>
  );
}
