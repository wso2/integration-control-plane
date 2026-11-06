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

import { Alert, Box, Button, Card, Chip, Paper, Stack, Typography } from '@wso2/oxygen-ui';
import { Mic, PhoneOff } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useVoiceTesterSession, type VoiceTesterStatus } from '../../hooks/useVoiceTesterSession';
import * as styles from './VoiceAgentTestPanel.styles';

const STATUS_LABEL: Record<VoiceTesterStatus, string> = { idle: 'Offline', connecting: 'Connecting', connected: 'Live', error: 'Failed' };
const STATUS_COLOR: Record<VoiceTesterStatus, 'default' | 'warning' | 'success' | 'error'> = { idle: 'default', connecting: 'warning', connected: 'success', error: 'error' };

interface VoiceAgentTestPanelProps {
  agentName: string;
  tokenServiceUrl: string | null;
  unavailableReason?: string;
}

export default function VoiceAgentTestPanel({ agentName, tokenServiceUrl, unavailableReason }: VoiceAgentTestPanelProps): JSX.Element {
  const { status, error, transcript, start, stop, audioContainerRef } = useVoiceTesterSession(tokenServiceUrl ?? '');
  const inCall = status === 'connecting' || status === 'connected';
  const canStart = !!tokenServiceUrl && !unavailableReason;

  return (
    <Card variant="outlined" sx={styles.panelSx}>
      <Box sx={styles.headerSx}>
        <Mic size={20} />
        <Typography variant="subtitle1" fontWeight={600}>
          Voice agent tester
        </Typography>
        <Chip size="small" variant="outlined" label={STATUS_LABEL[status]} color={STATUS_COLOR[status]} />
        <Box sx={{ flex: 1 }} />
        {inCall ? (
          <Button variant="outlined" color="error" startIcon={<PhoneOff size={16} />} onClick={stop}>
            End session
          </Button>
        ) : (
          <Button variant="contained" startIcon={<Mic size={16} />} onClick={start} disabled={!canStart}>
            Start session
          </Button>
        )}
      </Box>

      <Box sx={styles.stageSx}>
        <Box sx={styles.haloSx}>
          <Box sx={styles.orbSx(status === 'connected')} />
        </Box>
        <Typography variant="h5" fontWeight={600}>
          Voice tester
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {unavailableReason ?? (status === 'connected' ? `${agentName} is listening. Speak, and the conversation appears below.` : `${agentName} — click "Start session" to talk to the deployed voice agent.`)}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {transcript.length > 0 && (
          <Paper variant="outlined" sx={styles.transcriptSx}>
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
          </Paper>
        )}
      </Box>
      <Box ref={audioContainerRef} sx={styles.hiddenSx} />
    </Card>
  );
}
