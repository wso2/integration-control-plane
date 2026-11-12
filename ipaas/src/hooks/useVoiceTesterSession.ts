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

const TRANSCRIPT_TOPIC = 'voice-text';

export type VoiceTesterStatus = 'idle' | 'connecting' | 'connected' | 'error';

export function useVoiceTesterSession(tokenServiceUrl: string | null) {
  const [status, setStatus] = useState<VoiceTesterStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<VoiceTranscriptMessage[]>([]);
  const [audioBlocked, setAudioBlocked] = useState(false);
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
    setAudioBlocked(false);
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    if (!tokenServiceUrl) return;
    teardown();
    setError(null);
    setTranscript([]);
    setStatus('connecting');
    const room = new Room();
    roomRef.current = room;
    let connected = false;
    try {
      const { token, url } = await fetchVoiceAgentRoomToken(tokenServiceUrl, `voice-tester-${Date.now()}`, 'console-tester');
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
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio));
      room.on(RoomEvent.Disconnected, () => {
        if (!connected || roomRef.current !== room) return;
        teardown();
        setStatus('idle');
      });
      await room.connect(url, token);
      if (roomRef.current !== room) return;
      connected = true;
      await room.startAudio().catch(() => undefined);
      if (roomRef.current !== room) return;
      setAudioBlocked(!room.canPlaybackAudio);
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

  const resumeAudio = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    room
      .startAudio()
      .then(() => setAudioBlocked(!room.canPlaybackAudio))
      .catch((e) => console.error('Voice tester audio playback failed', e));
  }, []);

  const stop = useCallback(() => {
    teardown();
    setStatus('idle');
  }, [teardown]);

  return { status, error, transcript, audioBlocked, start, stop, resumeAudio, audioContainerRef };
}
