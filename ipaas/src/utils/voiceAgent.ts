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

import { CUSTOM_VOICE_ID, STT_PROVIDERS, TTS_PROVIDERS } from '../constants/voiceAgentProviders';
import type { TurnDetectionModel, VoiceAgentDeployment, VoiceAgentSettings } from '../types/voiceAgent';
import { toHandler } from './string';

/** The voice-agent component's handler is capped so the generated workload names stay within Kubernetes limits. */
const MAX_HANDLER_LENGTH = 25;

export const DEFAULT_VOICE_AGENT_SETTINGS: VoiceAgentSettings = {
  displayName: '',
  description: '',
  targetAgentWsUrl: '',
  liveKitUrl: '',
  liveKitApiKey: '',
  liveKitApiSecret: '',
  sttProvider: '',
  sttModel: '',
  sttLanguage: '',
  sttApiKey: '',
  ttsProvider: '',
  ttsModel: '',
  ttsVoiceId: '',
  ttsCustomVoiceId: '',
  ttsLanguage: '',
  ttsApiKey: '',
  turnDetectionModel: 'multilingual',
  bargeInMode: 'always',
  bargeInMinDuration: 0.5,
  bargeInMinWords: 1,
  endpointingMode: 'dynamic',
  endpointingMinDelay: 200,
  endpointingMaxDelay: 2000,
  textOutputEnabled: true,
  userAwayTimeout: 15,
  closeOnParticipantDisconnect: true,
  noiseCancellationEnabled: false,
  vadActivationThreshold: 0.5,
  vadDeactivationThreshold: 0.35,
  vadMinSpeechDuration: 0.05,
  vadMinSilenceDuration: 0.55,
  corsAllowedOrigins: '*',
  tokenTtl: 3600,
};

// The image's names for the form's choices (backend/config.py).
const TURN_DETECTION_MODE: Record<TurnDetectionModel, string> = {
  multilingual: 'adaptive',
  vad_only: 'vad',
  stt_endpointing: 'stt',
};

export function isWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'ws:' || url.protocol === 'wss:') && url.host !== '';
  } catch {
    return false;
  }
}

/** The integration handler a voice agent is created under, derived from its display name. */
export function voiceAgentHandler(displayName: string): string {
  return toHandler(displayName).slice(0, MAX_HANDLER_LENGTH).replace(/-+$/, '');
}

/** Picking a provider selects its first model and language, so every step is valid as soon as a provider is chosen. */
export function withSttProvider(settings: VoiceAgentSettings, providerId: string): VoiceAgentSettings {
  const provider = STT_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return settings;
  return { ...settings, sttProvider: provider.id, sttModel: provider.models[0].id, sttLanguage: provider.languages[0].code };
}

export function withTtsProvider(settings: VoiceAgentSettings, providerId: string): VoiceAgentSettings {
  const provider = TTS_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return settings;
  return {
    ...settings,
    ttsProvider: provider.id,
    ttsModel: provider.models[0].id,
    ttsVoiceId: provider.voices[0].id,
    ttsCustomVoiceId: '',
    ttsLanguage: provider.languages[0].code,
  };
}

/** Field errors for one wizard step; an empty object means the step is complete. */
export type StepErrors = Partial<Record<keyof VoiceAgentSettings, string>>;

export function validateAgentStep(s: VoiceAgentSettings): StepErrors {
  const errors: StepErrors = {};
  if (!s.displayName.trim()) errors.displayName = 'Enter a name.';
  else if (voiceAgentHandler(s.displayName).length < 3) errors.displayName = 'Use at least three letters or digits.';
  if (!isWebSocketUrl(s.targetAgentWsUrl)) errors.targetAgentWsUrl = 'Enter a ws:// or wss:// URL.';
  return errors;
}

export function validateLiveKitStep(s: VoiceAgentSettings): StepErrors {
  const errors: StepErrors = {};
  if (!isWebSocketUrl(s.liveKitUrl)) errors.liveKitUrl = 'Enter a ws:// or wss:// URL.';
  if (!s.liveKitApiKey.trim()) errors.liveKitApiKey = 'Enter the API key.';
  if (!s.liveKitApiSecret.trim()) errors.liveKitApiSecret = 'Enter the API secret.';
  return errors;
}

export function validateSttStep(s: VoiceAgentSettings): StepErrors {
  const errors: StepErrors = {};
  if (!s.sttProvider) errors.sttProvider = 'Choose a provider.';
  if (!s.sttApiKey.trim()) errors.sttApiKey = 'Enter the API key.';
  return errors;
}

export function validateTtsStep(s: VoiceAgentSettings): StepErrors {
  const errors: StepErrors = {};
  if (!s.ttsProvider) errors.ttsProvider = 'Choose a provider.';
  if (s.ttsVoiceId === CUSTOM_VOICE_ID && !s.ttsCustomVoiceId.trim()) errors.ttsCustomVoiceId = 'Enter the voice ID.';
  if (!s.ttsApiKey.trim()) errors.ttsApiKey = 'Enter the API key.';
  return errors;
}

const NUMERIC_TUNING_FIELDS = [
  'bargeInMinDuration',
  'bargeInMinWords',
  'endpointingMinDelay',
  'endpointingMaxDelay',
  'userAwayTimeout',
  'vadActivationThreshold',
  'vadDeactivationThreshold',
  'vadMinSpeechDuration',
  'vadMinSilenceDuration',
  'tokenTtl',
] as const satisfies readonly (keyof VoiceAgentSettings)[];

export function validateTuningStep(s: VoiceAgentSettings): StepErrors {
  const errors: StepErrors = {};
  // A cleared number field is NaN, which every comparison below would let through.
  for (const field of NUMERIC_TUNING_FIELDS) {
    if (!Number.isFinite(s[field])) errors[field] = 'Enter a number.';
  }
  if (Object.keys(errors).length > 0) return errors;
  if (s.endpointingMinDelay < 0) errors.endpointingMinDelay = 'Use a value of 0 or more.';
  if (s.endpointingMaxDelay < s.endpointingMinDelay) errors.endpointingMaxDelay = 'Use a value no lower than the minimum delay.';
  if (s.userAwayTimeout <= 0) errors.userAwayTimeout = 'Use a value above 0.';
  if (s.tokenTtl <= 0) errors.tokenTtl = 'Use a value above 0.';
  return errors;
}

const seconds = (ms: number): string => String(ms / 1000);

/**
 * The env vars the voice-agent image reads, split into plain settings and the
 * provider keys. AGENT_NAME is not sent: the BFF sets it to the integration name.
 */
export function buildVoiceAgentDeployment(s: VoiceAgentSettings): VoiceAgentDeployment {
  const config: Record<string, string> = {
    TARGET_AGENT_WS_URL: s.targetAgentWsUrl.trim(),
    LIVEKIT_URL: s.liveKitUrl.trim(),
    STT_PROVIDER: s.sttProvider,
    STT_MODEL: s.sttModel,
    STT_LANGUAGE: s.sttLanguage,
    TTS_PROVIDER: s.ttsProvider,
    TTS_MODEL: s.ttsModel,
    TTS_VOICE_ID: s.ttsVoiceId === CUSTOM_VOICE_ID ? s.ttsCustomVoiceId.trim() : s.ttsVoiceId,
    TTS_LANGUAGE: s.ttsLanguage,
    // The form exposes no switch for these; the previous console always sent them on.
    TURN_DETECTION_ENABLED: 'true',
    TURN_DETECTION_MODE: TURN_DETECTION_MODE[s.turnDetectionModel],
    BARGE_IN_ENABLED: 'true',
    BARGE_IN_MODE: s.bargeInMode,
    BARGE_IN_MIN_DURATION: String(s.bargeInMinDuration),
    BARGE_IN_MIN_WORDS: String(s.bargeInMinWords),
    VAD_ACTIVATION_THRESHOLD: String(s.vadActivationThreshold),
    VAD_DEACTIVATION_THRESHOLD: String(s.vadDeactivationThreshold),
    VAD_MIN_SPEECH_DURATION: String(s.vadMinSpeechDuration),
    VAD_MIN_SILENCE_DURATION: String(s.vadMinSilenceDuration),
    ENDPOINTING_MODE: s.endpointingMode === 'static' ? 'fixed' : 'dynamic',
    ENDPOINTING_MIN_DELAY: seconds(s.endpointingMinDelay),
    ENDPOINTING_MAX_DELAY: seconds(s.endpointingMaxDelay),
    NOISE_CANCELLATION_ENABLED: String(s.noiseCancellationEnabled),
    TRANSCRIPTION_ENABLED: String(s.textOutputEnabled),
    USER_AWAY_TIMEOUT: String(s.userAwayTimeout),
    CLOSE_ON_PARTICIPANT_DISCONNECT: String(s.closeOnParticipantDisconnect),
    CORS_ALLOWED_ORIGINS: s.corsAllowedOrigins.trim() || '*',
    LIVEKIT_TOKEN_TTL: String(s.tokenTtl),
  };
  const secrets = {
    LIVEKIT_API_KEY: s.liveKitApiKey.trim(),
    LIVEKIT_API_SECRET: s.liveKitApiSecret.trim(),
    STT_API_KEY: s.sttApiKey.trim(),
    TTS_API_KEY: s.ttsApiKey.trim(),
  };
  return { config, secrets };
}

export interface VoiceTranscriptMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  interrupted?: boolean;
}

/** The newest messages kept in the tester, so a long call cannot grow the list without bound. */
export const MAX_TRANSCRIPT_MESSAGES = 200;

/**
 * Applies one message from the worker's `voice-text` data topic to the transcript.
 * `stt` is what the caller said, `assistant` what the agent answered, and
 * `interrupt` marks the agent's last answer as cut off by the caller. Anything
 * else (including malformed JSON) leaves the transcript unchanged.
 */
export function applyTranscriptEvent(prev: VoiceTranscriptMessage[], raw: string, nextId: number): VoiceTranscriptMessage[] {
  let event: { type?: unknown; text?: unknown };
  try {
    event = JSON.parse(raw);
  } catch {
    return prev;
  }
  if (event.type === 'interrupt') {
    const last = prev[prev.length - 1];
    if (!last || last.role !== 'assistant') return prev;
    return [...prev.slice(0, -1), { ...last, interrupted: true }];
  }
  if ((event.type !== 'stt' && event.type !== 'assistant') || typeof event.text !== 'string' || !event.text.trim()) return prev;
  const next = [...prev, { id: nextId, role: event.type === 'stt' ? 'user' : 'assistant', text: event.text.trim() } satisfies VoiceTranscriptMessage];
  return next.length > MAX_TRANSCRIPT_MESSAGES ? next.slice(next.length - MAX_TRANSCRIPT_MESSAGES) : next;
}

/** The endpoint the BFF publishes a voice agent's token service on (ipaas-service models.VoiceAgentTokenEndpointName). */
export const VOICE_AGENT_TOKEN_ENDPOINT = 'token-service';

/** The token service URL the browser calls, or null while the endpoint has no external URL yet. */
export function tokenServiceUrlOf(endpoints: readonly { id: string; publicUrl?: string | null }[] | undefined): string | null {
  return endpoints?.find((e) => e.id === VOICE_AGENT_TOKEN_ENDPOINT)?.publicUrl || null;
}
