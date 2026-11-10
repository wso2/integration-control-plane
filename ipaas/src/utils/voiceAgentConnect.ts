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

export function voiceAgentGetTokenUrl(tokenServiceUrl: string): string {
  return `${tokenServiceUrl.replace(/\/+$/, '')}/getToken`;
}

export function voiceAgentBackendEnv(tokenServiceUrl: string): string {
  return `VOICE_AGENT_TOKEN_URL=${voiceAgentGetTokenUrl(tokenServiceUrl)}`;
}

export const VOICE_AGENT_TOKEN_RESPONSE = '{ "token": "<livekit-room-token>", "url": "wss://<livekit-server-url>" }';

export const VOICE_AGENT_BACKEND_SAMPLE = `const express = require('express');

const app = express();

app.get('/getToken', async (req, res) => {
  // Forward the client's query parameters to the voice agent's token service.
  const url = new URL(process.env.VOICE_AGENT_TOKEN_URL);
  for (const [key, value] of Object.entries(req.query)) {
    url.searchParams.set(key, value);
  }
  const upstream = await fetch(url);
  if (!upstream.ok) {
    res.status(502).json({ error: 'The voice agent did not return a room token.' });
    return;
  }
  res.json(await upstream.json()); // { token, url }
});

app.listen(8007);`;

export const VOICE_AGENT_CLIENT_SAMPLE = `import { useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';

export function VoiceSession() {
  const [session, setSession] = useState(null);

  const start = async () => {
    const res = await fetch(
      'https://your-backend/getToken?roomName=voice-room&participantName=user-1'
    );
    setSession(await res.json()); // { token, url }
  };

  return session ? (
    <LiveKitRoom
      token={session.token}
      serverUrl={session.url}
      connect
      audio
      onDisconnected={() => setSession(null)}
    >
      <RoomAudioRenderer />
    </LiveKitRoom>
  ) : (
    <button onClick={start}>Start voice session</button>
  );
}`;
