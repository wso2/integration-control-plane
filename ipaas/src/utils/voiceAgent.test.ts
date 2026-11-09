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

import { describe, expect, it } from 'vitest';
import type { VoiceAgentSettings } from '../types/voiceAgent';
import {
  applyTranscriptEvent,
  buildVoiceAgentDeployment,
  DEFAULT_VOICE_AGENT_SETTINGS,
  MAX_TRANSCRIPT_MESSAGES,
  agentVoiceWsUrl,
  effectiveVoiceAgentHandler,
  isVoiceEndpoint,
  isWebSocketUrl,
  linkedAgentHandlerOf,
  voiceTargetLabel,
  tokenServiceUrlOf,
  validateAgentStep,
  validateLiveKitStep,
  validateTtsStep,
  validateTuningStep,
  voiceAgentHandler,
  withSttProvider,
  withTtsProvider,
} from './voiceAgent';

const complete: VoiceAgentSettings = withTtsProvider(
  withSttProvider(
    {
      ...DEFAULT_VOICE_AGENT_SETTINGS,
      displayName: 'Support line',
      targetMode: 'external',
      targetAgentWsUrl: 'wss://agent.example.com/ws',
      liveKitUrl: 'wss://demo.livekit.cloud',
      liveKitApiKey: 'lk-key',
      liveKitApiSecret: 'lk-secret',
      sttApiKey: 'stt-key',
      ttsApiKey: 'tts-key',
    },
    'deepgram',
  ),
  'cartesia',
);

describe('isWebSocketUrl', () => {
  it.each([
    ['wss://demo.livekit.cloud', true],
    ['ws://localhost:7880', true],
    ['https://demo.livekit.cloud', false],
    ['wss://', false],
    ['not a url', false],
  ])('%s → %s', (value, expected) => {
    expect(isWebSocketUrl(value)).toBe(expected);
  });
});

describe('voiceAgentHandler', () => {
  it('slugs the display name and caps it without a trailing dash', () => {
    expect(voiceAgentHandler('Customer Support Voice Line Agent')).toBe('customer-support-voice-li');
    expect(voiceAgentHandler('A very long name that ends right-')).not.toMatch(/-$/);
  });
});

describe('provider selection', () => {
  it('selects the provider’s first model, voice and language', () => {
    expect(complete.sttModel).toBe('deepgram/nova-3-general');
    expect(complete.sttLanguage).toBe('en');
    expect(complete.ttsModel).toBe('cartesia/sonic-3');
    expect(complete.ttsVoiceId).toBe('f786b574-daa5-4673-aa0c-cbe3e8534c02');
  });

  it('ignores an unknown provider', () => {
    expect(withSttProvider(complete, 'nope')).toBe(complete);
  });
});

describe('step validation', () => {
  it('accepts a complete form', () => {
    expect(validateAgentStep(complete)).toEqual({});
    expect(validateLiveKitStep(complete)).toEqual({});
    expect(validateTtsStep(complete)).toEqual({});
    expect(validateTuningStep(complete)).toEqual({});
  });

  it('rejects an http agent URL and a missing LiveKit secret', () => {
    expect(validateAgentStep({ ...complete, targetAgentWsUrl: 'https://agent.example.com' })).toHaveProperty('targetAgentWsUrl');
    expect(validateLiveKitStep({ ...complete, liveKitApiSecret: ' ' })).toHaveProperty('liveKitApiSecret');
  });

  it('needs an agent with a reachable endpoint for a platform-hosted target', () => {
    const platform = { ...complete, targetMode: 'platform' as const, targetAgentWsUrl: '' };
    expect(validateAgentStep(platform)).toEqual({ targetAgentHandler: 'Choose an agent.' });
    expect(validateAgentStep({ ...platform, targetAgentHandler: 'support-agent' })).toHaveProperty('targetAgentHandler');
    expect(validateAgentStep({ ...platform, targetAgentHandler: 'support-agent', targetAgentWsUrl: 'ws://support-agent:8080' })).toEqual({});
  });

  it('checks the typed name, not the display name, when one is given', () => {
    expect(validateAgentStep({ ...complete, name: 'ab' })).toHaveProperty('name');
    expect(effectiveVoiceAgentHandler({ displayName: 'Support line', name: '' })).toBe('support-line');
    expect(effectiveVoiceAgentHandler({ displayName: 'Support line', name: 'Help Desk' })).toBe('help-desk');
  });

  it('requires the voice id when a custom voice is chosen', () => {
    expect(validateTtsStep({ ...complete, ttsVoiceId: 'custom' })).toHaveProperty('ttsCustomVoiceId');
  });

  it('rejects a negative padding or delay and an empty speech buffer', () => {
    expect(validateTuningStep({ ...complete, vadPrefixPaddingDuration: -1 })).toHaveProperty('vadPrefixPaddingDuration');
    expect(validateTuningStep({ ...complete, minConsecutiveSpeechDelay: -5 })).toHaveProperty('minConsecutiveSpeechDelay');
    expect(validateTuningStep({ ...complete, vadMaxBufferedSpeech: 0 })).toHaveProperty('vadMaxBufferedSpeech');
  });

  it('rejects a cleared number field', () => {
    expect(validateTuningStep({ ...complete, userAwayTimeout: Number.NaN })).toEqual({ userAwayTimeout: 'Enter a number.' });
  });

  it('rejects a maximum endpointing delay below the minimum', () => {
    expect(validateTuningStep({ ...complete, endpointingMinDelay: 500, endpointingMaxDelay: 100 })).toHaveProperty('endpointingMaxDelay');
  });
});

describe('buildVoiceAgentDeployment', () => {
  it('keeps the provider keys out of the plain config', () => {
    const { config, secrets } = buildVoiceAgentDeployment(complete);
    expect(secrets).toEqual({ LIVEKIT_API_KEY: 'lk-key', LIVEKIT_API_SECRET: 'lk-secret', STT_API_KEY: 'stt-key', TTS_API_KEY: 'tts-key' });
    for (const key of Object.keys(secrets)) expect(config).not.toHaveProperty(key);
  });

  it('sends the timing, VAD and interruption settings Devant sends, in the image’s units', () => {
    const { config } = buildVoiceAgentDeployment({ ...complete, minConsecutiveSpeechDelay: 250, vadPrefixPaddingDuration: 0.4, vadMaxBufferedSpeech: 45, discardAudioIfUninterruptible: true });
    expect(config.MIN_CONSECUTIVE_SPEECH_DELAY).toBe('0.25');
    expect(config.VAD_PREFIX_PADDING_DURATION).toBe('0.4');
    expect(config.VAD_MAX_BUFFERED_SPEECH).toBe('45');
    expect(config.DISCARD_AUDIO_IF_UNINTERRUPTIBLE).toBe('true');
  });

  it('maps the form to the image’s names and units', () => {
    const { config } = buildVoiceAgentDeployment({ ...complete, endpointingMode: 'static', endpointingMinDelay: 300, turnDetectionModel: 'vad_only' });
    expect(config.ENDPOINTING_MODE).toBe('fixed');
    expect(config.ENDPOINTING_MIN_DELAY).toBe('0.3');
    expect(config.ENDPOINTING_MAX_DELAY).toBe('2');
    expect(config.TURN_DETECTION_MODE).toBe('vad');
    expect(config.TARGET_AGENT_WS_URL).toBe('wss://agent.example.com/ws');
    expect(config).not.toHaveProperty('AGENT_NAME');
  });

  it('sends the custom voice id in place of the custom marker', () => {
    const { config } = buildVoiceAgentDeployment({ ...complete, ttsVoiceId: 'custom', ttsCustomVoiceId: ' voice-123 ' });
    expect(config.TTS_VOICE_ID).toBe('voice-123');
  });

  it('sends every value the image requires', () => {
    const { config } = buildVoiceAgentDeployment(complete);
    for (const key of ['LIVEKIT_URL', 'TARGET_AGENT_WS_URL', 'STT_PROVIDER', 'STT_MODEL', 'TTS_PROVIDER', 'TTS_MODEL', 'TTS_VOICE_ID']) {
      expect(config[key], key).toBeTruthy();
    }
  });
});

describe('applyTranscriptEvent', () => {
  const said = (text: string) => JSON.stringify({ type: 'stt', text });
  const answered = (text: string) => JSON.stringify({ type: 'assistant', text });

  it('appends what the caller said and what the agent answered', () => {
    const t = applyTranscriptEvent(applyTranscriptEvent([], said(' hello '), 1), answered('Hi there'), 2);
    expect(t).toEqual([
      { id: 1, role: 'user', text: 'hello' },
      { id: 2, role: 'assistant', text: 'Hi there' },
    ]);
  });

  it('marks only an agent answer as interrupted', () => {
    const answeredOnce = applyTranscriptEvent([], answered('Long answer'), 1);
    expect(applyTranscriptEvent(answeredOnce, JSON.stringify({ type: 'interrupt' }), 2)[0].interrupted).toBe(true);
    const saidOnce = applyTranscriptEvent([], said('hello'), 1);
    expect(applyTranscriptEvent(saidOnce, JSON.stringify({ type: 'interrupt' }), 2)).toBe(saidOnce);
  });

  it('ignores malformed, empty and unknown messages', () => {
    const t = applyTranscriptEvent([], said('hello'), 1);
    expect(applyTranscriptEvent(t, 'not json', 2)).toBe(t);
    expect(applyTranscriptEvent(t, said('   '), 2)).toBe(t);
    expect(applyTranscriptEvent(t, JSON.stringify({ type: 'metrics', text: 'x' }), 2)).toBe(t);
  });

  it('keeps only the newest messages', () => {
    let t: ReturnType<typeof applyTranscriptEvent> = [];
    for (let i = 0; i < MAX_TRANSCRIPT_MESSAGES + 5; i++) t = applyTranscriptEvent(t, said(`m${i}`), i);
    expect(t).toHaveLength(MAX_TRANSCRIPT_MESSAGES);
    expect(t[t.length - 1].text).toBe(`m${MAX_TRANSCRIPT_MESSAGES + 4}`);
  });
});

describe('tokenServiceUrlOf', () => {
  it('returns the token service endpoint’s external URL', () => {
    const endpoints = [
      { id: 'other', publicUrl: 'https://x/other' },
      { id: 'token-service', publicUrl: 'https://gw:19443/agent-token-service' },
    ];
    expect(tokenServiceUrlOf(endpoints)).toBe('https://gw:19443/agent-token-service');
  });

  it('is null until the endpoint has an external URL', () => {
    expect(tokenServiceUrlOf(undefined)).toBeNull();
    expect(tokenServiceUrlOf([{ id: 'token-service', publicUrl: null }])).toBeNull();
    expect(tokenServiceUrlOf([{ id: 'token-service', publicUrl: '' }])).toBeNull();
  });
});

describe('voice target link', () => {
  it('reads back the agent a label names, from a list or the comma-joined form', () => {
    expect(linkedAgentHandlerOf([voiceTargetLabel('support-agent')])).toBe('support-agent');
    expect(linkedAgentHandlerOf(`team:a, ${voiceTargetLabel('support-agent')}`)).toBe('support-agent');
    expect(linkedAgentHandlerOf(['team:a'])).toBeNull();
    expect(linkedAgentHandlerOf(undefined)).toBeNull();
  });
});

describe('agentVoiceWsUrl', () => {
  it('prefers a WebSocket endpoint and its in-project URL', () => {
    expect(
      agentVoiceWsUrl([
        { type: 'REST', projectUrl: 'http://agent:9090' },
        { type: 'WS', projectUrl: 'http://agent:8080/', publicUrl: 'https://gw.example.com/agent' },
      ]),
    ).toBe('ws://agent:8080');
  });

  it('uses a lone endpoint whatever its type, falling back to the public URL', () => {
    expect(agentVoiceWsUrl([{ type: 'HTTP', publicUrl: 'https://gw.example.com/agent' }])).toBe('wss://gw.example.com/agent');
  });

  it('gives up on several non-WebSocket endpoints, or none', () => {
    expect(agentVoiceWsUrl([{ type: 'REST', projectUrl: 'http://a' }, { type: 'REST', projectUrl: 'http://b' }])).toBeNull();
    expect(agentVoiceWsUrl([])).toBeNull();
    expect(agentVoiceWsUrl(undefined)).toBeNull();
  });
});

describe('isVoiceEndpoint', () => {
  it('is the WebSocket endpoint, not the chat API', () => {
    expect(isVoiceEndpoint({ type: 'WS' })).toBe(true);
    expect(isVoiceEndpoint({ type: 'Websocket' })).toBe(true);
    expect(isVoiceEndpoint({ type: 'REST' })).toBe(false);
    expect(isVoiceEndpoint(undefined)).toBe(false);
  });
});
