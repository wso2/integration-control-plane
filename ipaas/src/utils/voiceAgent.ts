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
import { notDeployedNotice } from './deploymentNotice';
import type { TurnDetectionModel, VoiceAgentDeployment, VoiceAgentSettings } from '../types/voiceAgent';
import { toHandler } from './string';

const MAX_HANDLER_LENGTH = 25;

export const DEFAULT_VOICE_AGENT_SETTINGS: VoiceAgentSettings = {
  displayName: '',
  name: '',
  description: '',
  targetMode: 'platform',
  targetAgentHandler: '',
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
  discardAudioIfUninterruptible: false,
  endpointingMode: 'dynamic',
  endpointingMinDelay: 200,
  endpointingMaxDelay: 2000,
  textOutputEnabled: true,
  userAwayTimeout: 15,
  minConsecutiveSpeechDelay: 200,
  closeOnParticipantDisconnect: true,
  noiseCancellationEnabled: false,
  vadActivationThreshold: 0.5,
  vadDeactivationThreshold: 0.35,
  vadMinSpeechDuration: 0.05,
  vadMinSilenceDuration: 0.55,
  vadPrefixPaddingDuration: 0.5,
  vadMaxBufferedSpeech: 60,
  corsAllowedOrigins: '*',
  tokenTtl: 3600,
};

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

export function voiceAgentHandler(displayName: string): string {
  return toHandler(displayName).slice(0, MAX_HANDLER_LENGTH).replace(/-+$/, '');
}

export function effectiveVoiceAgentHandler(s: Pick<VoiceAgentSettings, 'displayName' | 'name'>): string {
  return s.name.trim() ? voiceAgentHandler(s.name) : voiceAgentHandler(s.displayName);
}

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

export const helperText = (error: string | undefined, hint = ' '): string => error ?? hint;

export type StepErrors = Partial<Record<keyof VoiceAgentSettings, string>>;

export function visibleStepErrors(errors: StepErrors, touched: ReadonlySet<keyof VoiceAgentSettings>, showAll: boolean): StepErrors {
  if (showAll) return errors;
  const visible: StepErrors = {};
  for (const [field, message] of Object.entries(errors) as [keyof VoiceAgentSettings, string][]) {
    if (touched.has(field) || (field === 'name' && touched.has('displayName'))) visible[field] = message;
  }
  return visible;
}

export function validateAgentStep(s: VoiceAgentSettings, voicedAgents: ReadonlySet<string> = new Set()): StepErrors {
  const errors: StepErrors = {};
  if (!s.displayName.trim()) errors.displayName = 'Enter a display name.';
  if (effectiveVoiceAgentHandler(s).length < 3) errors.name = 'Use at least three letters or digits.';
  if (s.targetMode === 'external') {
    if (!isWebSocketUrl(s.targetAgentWsUrl)) errors.targetAgentWsUrl = 'Enter a ws:// or wss:// URL.';
  } else if (!s.targetAgentHandler) {
    errors.targetAgentHandler = 'Choose an agent.';
  } else if (voicedAgents.has(s.targetAgentHandler)) {
    errors.targetAgentHandler = 'This agent already has a voice agent. Choose another one.';
  } else if (!isWebSocketUrl(s.targetAgentWsUrl)) {
    errors.targetAgentHandler = 'This agent has no reachable endpoint yet. Deploy it, then try again.';
  }
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
  'minConsecutiveSpeechDelay',
  'vadActivationThreshold',
  'vadDeactivationThreshold',
  'vadMinSpeechDuration',
  'vadMinSilenceDuration',
  'vadPrefixPaddingDuration',
  'vadMaxBufferedSpeech',
  'tokenTtl',
] as const satisfies readonly (keyof VoiceAgentSettings)[];

type NumericTuningField = (typeof NUMERIC_TUNING_FIELDS)[number];

const NON_NEGATIVE_TUNING_FIELDS = ['bargeInMinDuration', 'endpointingMinDelay', 'minConsecutiveSpeechDelay', 'vadMinSpeechDuration', 'vadMinSilenceDuration', 'vadPrefixPaddingDuration'] as const satisfies readonly NumericTuningField[];

const POSITIVE_TUNING_FIELDS = ['userAwayTimeout', 'vadMaxBufferedSpeech', 'tokenTtl'] as const satisfies readonly NumericTuningField[];

const isBetween0And1 = (value: number): boolean => value >= 0 && value <= 1;

export function validateTuningStep(s: VoiceAgentSettings): StepErrors {
  const errors: StepErrors = {};
  if (!s.corsAllowedOrigins.trim()) errors.corsAllowedOrigins = 'Enter at least one origin, or * to allow any.';
  for (const field of NUMERIC_TUNING_FIELDS) {
    if (!Number.isFinite(s[field])) errors[field] = 'Enter a number.';
  }
  if (Object.keys(errors).length > 0) return errors;
  for (const field of NON_NEGATIVE_TUNING_FIELDS) {
    if (s[field] < 0) errors[field] = 'Enter a value of 0 or more.';
  }
  for (const field of POSITIVE_TUNING_FIELDS) {
    if (s[field] <= 0) errors[field] = 'Enter a value above 0.';
  }
  if (!Number.isInteger(s.bargeInMinWords) || s.bargeInMinWords < 0) errors.bargeInMinWords = 'Enter a whole number of 0 or more.';
  if (!errors.tokenTtl && !Number.isInteger(s.tokenTtl)) errors.tokenTtl = 'Enter a whole number of seconds.';
  if (!errors.endpointingMinDelay && s.endpointingMaxDelay < s.endpointingMinDelay) errors.endpointingMaxDelay = 'Enter a value no lower than the minimum delay.';
  if (!isBetween0And1(s.vadActivationThreshold)) errors.vadActivationThreshold = 'Enter a value between 0 and 1.';
  if (!isBetween0And1(s.vadDeactivationThreshold)) errors.vadDeactivationThreshold = 'Enter a value between 0 and 1.';
  else if (!errors.vadActivationThreshold && s.vadDeactivationThreshold >= s.vadActivationThreshold) errors.vadDeactivationThreshold = 'Enter a value below the activation threshold.';
  return errors;
}

export function voiceAgentEnvironment<T>(pipelineEnvironments: readonly T[]): T | undefined {
  return pipelineEnvironments[0];
}

const seconds = (ms: number): string => String(ms / 1000);

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
    TURN_DETECTION_ENABLED: 'true',
    TURN_DETECTION_MODE: TURN_DETECTION_MODE[s.turnDetectionModel],
    BARGE_IN_ENABLED: 'true',
    BARGE_IN_MODE: s.bargeInMode,
    BARGE_IN_MIN_DURATION: String(s.bargeInMinDuration),
    BARGE_IN_MIN_WORDS: String(s.bargeInMinWords),
    DISCARD_AUDIO_IF_UNINTERRUPTIBLE: String(s.discardAudioIfUninterruptible),
    VAD_ACTIVATION_THRESHOLD: String(s.vadActivationThreshold),
    VAD_DEACTIVATION_THRESHOLD: String(s.vadDeactivationThreshold),
    VAD_MIN_SPEECH_DURATION: String(s.vadMinSpeechDuration),
    VAD_MIN_SILENCE_DURATION: String(s.vadMinSilenceDuration),
    VAD_PREFIX_PADDING_DURATION: String(s.vadPrefixPaddingDuration),
    VAD_MAX_BUFFERED_SPEECH: String(s.vadMaxBufferedSpeech),
    ENDPOINTING_MODE: s.endpointingMode === 'static' ? 'fixed' : 'dynamic',
    ENDPOINTING_MIN_DELAY: seconds(s.endpointingMinDelay),
    ENDPOINTING_MAX_DELAY: seconds(s.endpointingMaxDelay),
    NOISE_CANCELLATION_ENABLED: String(s.noiseCancellationEnabled),
    TRANSCRIPTION_ENABLED: String(s.textOutputEnabled),
    USER_AWAY_TIMEOUT: String(s.userAwayTimeout),
    MIN_CONSECUTIVE_SPEECH_DELAY: seconds(s.minConsecutiveSpeechDelay),
    CLOSE_ON_PARTICIPANT_DISCONNECT: String(s.closeOnParticipantDisconnect),
    CORS_ALLOWED_ORIGINS: s.corsAllowedOrigins.trim(),
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

export const MAX_TRANSCRIPT_MESSAGES = 200;

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

export const VOICE_AGENT_TOKEN_ENDPOINT = 'token-service';

export function tokenServiceUrlOf(endpoints: readonly { id: string; publicUrl?: string | null }[] | undefined): string | null {
  return endpoints?.find((e) => e.id === VOICE_AGENT_TOKEN_ENDPOINT)?.publicUrl || null;
}

const BLOCKING_DEPLOYMENT_STATUSES = new Set(['IN_PROGRESS', 'ERROR', 'SUSPENDED']);

interface VoiceTesterState {
  hasDeployment: boolean;
  deploymentStatus: string | null;
  endpointsFailed: boolean;
  tokenServiceUrl: string | null;
}

export function voiceTesterUnavailableReason({ hasDeployment, deploymentStatus, endpointsFailed, tokenServiceUrl }: VoiceTesterState): string | undefined {
  if (!hasDeployment) return notDeployedNotice(null, 'test').message;
  if (deploymentStatus && BLOCKING_DEPLOYMENT_STATUSES.has(deploymentStatus)) return notDeployedNotice(deploymentStatus, 'test').message;
  if (endpointsFailed) return "Couldn't load the voice agent's endpoints. Refresh the page to try again.";
  if (!tokenServiceUrl) return 'The voice agent is active, but its token service has no public URL yet.';
  return undefined;
}

interface AgentEndpointLike {
  type: string;
  projectUrl?: string | null;
  publicUrl?: string | null;
  invokeUrl?: string | null;
}

export function agentVoiceWsUrl(endpoints: readonly AgentEndpointLike[] | undefined): string | null {
  const ws = (endpoints ?? []).filter(isVoiceEndpoint);
  const ep = ws.find((e) => e.projectUrl) ?? ws.find((e) => e.publicUrl || e.invokeUrl);
  const base = ep?.projectUrl || ep?.publicUrl || ep?.invokeUrl;
  return base ? base.replace(/^http/i, 'ws').replace(/\/+$/, '') : null;
}

export function isVoiceEndpoint(endpoint: { type: string } | undefined): boolean {
  return !!endpoint && /^(ws|wss|websocket)$/i.test(endpoint.type);
}
