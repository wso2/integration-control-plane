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

import { Alert, Avatar, Box, Stack, Typography } from '@wso2/oxygen-ui';
import { Mic } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useVoiceTesterSession } from '../../hooks/useVoiceTesterSession';
import { VoiceAudioBlockedAlert, VoiceSessionButton, VoiceSessionStatusChip, VoiceTranscript } from './VoiceSession';
import { hiddenSx } from './VoiceSession.styles';
import * as styles from './VoiceAgentTester.styles';

interface VoiceAgentTesterProps {
  tokenServiceUrl: string | null;
  unavailableReason?: string;
}

export default function VoiceAgentTester({ tokenServiceUrl, unavailableReason }: VoiceAgentTesterProps): JSX.Element {
  const { status, error, transcript, audioBlocked, start, stop, resumeAudio, audioContainerRef } = useVoiceTesterSession(tokenServiceUrl);
  const canStart = !!tokenServiceUrl && !unavailableReason;
  const hint = unavailableReason ?? (status === 'connected' ? 'The session is live. Start speaking to see the conversation below.' : status === 'connecting' ? 'Connecting to the voice agent…' : 'Start a session to talk to the voice agent.');

  return (
    <Box>
      <Box sx={styles.rowSx}>
        <Avatar sx={styles.orbSx(status === 'connected')}>
          <Mic size={20} />
        </Avatar>
        <Box sx={styles.textSx}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography variant="subtitle1" fontWeight={600}>
              Voice tester
            </Typography>
            <VoiceSessionStatusChip status={status} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {hint}
          </Typography>
        </Box>
        <VoiceSessionButton status={status} canStart={canStart} onStart={start} onStop={stop} />
      </Box>
      {error && (
        <Alert severity="error" sx={styles.errorSx}>
          {error}
        </Alert>
      )}
      {audioBlocked && <VoiceAudioBlockedAlert onResume={resumeAudio} sx={styles.errorSx} />}
      <VoiceTranscript messages={transcript} sx={styles.transcriptSx} />
      <Box ref={audioContainerRef} sx={hiddenSx} />
    </Box>
  );
}
