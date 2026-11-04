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

import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchVoiceAgentRoomToken } from '../api/voiceAgents';
import { applyTranscriptEvent, type VoiceTranscriptMessage } from '../utils/voiceAgent';

/** The worker publishes transcripts on this data topic (backend/worker.py). */
const TRANSCRIPT_TOPIC = 'voice-text';

export type VoiceTesterStatus = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * A browser call to a deployed voice agent through LiveKit: a room token from the
 * agent's token service, the microphone published, the agent's audio played into
 * `audioContainerRef`, and its transcript collected. The room is the external
 * system this hook synchronises with, so every path out of a call — Stop, a
 * remote disconnect, unmount — tears it down.
 */
export function useVoiceTesterSession(tokenServiceUrl: string) {
  const [status, setStatus] = useState<VoiceTesterStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<VoiceTranscriptMessage[]>([]);
  const roomRef = useRef<Room | null>(null);
  const nextId = useRef(0);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);

  const teardown = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      room.disconnect().catch((e) => console.error('Voice tester disconnect failed', e));
    }
    audioContainerRef.current?.replaceChildren();
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    teardown();
    setError(null);
    setTranscript([]);
    setStatus('connecting');
    const room = new Room();
    roomRef.current = room;
    try {
      const { token, url } = await fetchVoiceAgentRoomToken(tokenServiceUrl, `voice-tester-${Date.now()}`, 'console-tester');
      // Stopped while the token was being fetched.
      if (roomRef.current !== room) return;
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) audioContainerRef.current?.appendChild(track.attach());
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach((el) => el.remove()));
      room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
        if (topic !== TRANSCRIPT_TOPIC) return;
        nextId.current += 1;
        const id = nextId.current;
        const raw = new TextDecoder().decode(payload);
        setTranscript((prev) => applyTranscriptEvent(prev, raw, id));
      });
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current !== room) return;
        teardown();
        setStatus('idle');
      });
      await room.connect(url, token);
      if (roomRef.current !== room) return;
      await room.localParticipant.setMicrophoneEnabled(true);
      if (roomRef.current !== room) return;
      setStatus('connected');
    } catch (e) {
      if (roomRef.current !== room) return;
      teardown();
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not start the call.');
    }
  }, [teardown, tokenServiceUrl]);

  const stop = useCallback(() => {
    teardown();
    setStatus('idle');
  }, [teardown]);

  return { status, error, transcript, start, stop, audioContainerRef };
}
