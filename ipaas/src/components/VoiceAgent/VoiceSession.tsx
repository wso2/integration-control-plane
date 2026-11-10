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

import { Alert, Box, Button, Chip, Paper, Stack, Typography, type SxProps, type Theme } from '@wso2/oxygen-ui';
import { Mic, PhoneOff } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { VoiceTesterStatus } from '../../hooks/useVoiceTesterSession';
import type { VoiceTranscriptMessage } from '../../utils/voiceAgent';

const STATUS_LABEL: Record<VoiceTesterStatus, string> = { idle: 'Offline', connecting: 'Connecting', connected: 'Live', error: 'Failed' };
const STATUS_COLOR: Record<VoiceTesterStatus, 'default' | 'warning' | 'success' | 'error'> = { idle: 'default', connecting: 'warning', connected: 'success', error: 'error' };

export function VoiceSessionStatusChip({ status }: { status: VoiceTesterStatus }): JSX.Element {
  return <Chip size="small" variant="outlined" label={STATUS_LABEL[status]} color={STATUS_COLOR[status]} />;
}

interface VoiceSessionButtonProps {
  status: VoiceTesterStatus;
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceSessionButton({ status, canStart, onStart, onStop }: VoiceSessionButtonProps): JSX.Element {
  if (status === 'connecting' || status === 'connected') {
    return (
      <Button variant="outlined" color="error" startIcon={<PhoneOff size={16} />} onClick={onStop}>
        End session
      </Button>
    );
  }
  return (
    <Button variant="contained" startIcon={<Mic size={16} />} onClick={onStart} disabled={!canStart}>
      Start session
    </Button>
  );
}

export function VoiceAudioBlockedAlert({ onResume, sx }: { onResume: () => void; sx?: SxProps<Theme> }): JSX.Element {
  return (
    <Alert
      severity="warning"
      sx={sx}
      action={
        <Button color="inherit" size="small" onClick={onResume}>
          Play audio
        </Button>
      }>
      Your browser blocked the voice agent&apos;s audio. Select Play audio to hear it.
    </Alert>
  );
}

export function VoiceTranscript({ messages, sx }: { messages: VoiceTranscriptMessage[]; sx: SxProps<Theme> }): JSX.Element | null {
  if (messages.length === 0) return null;
  return (
    <Paper variant="outlined" sx={sx}>
      <Stack gap={1}>
        {messages.map((m) => (
          <Box key={m.id}>
            <Typography variant="caption" color="text.secondary">
              {m.role === 'user' ? 'You' : 'Agent'}
              {m.interrupted ? ' (interrupted)' : ''}
            </Typography>
            <Typography variant="body2">{m.text}</Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
