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

export interface VoiceOption {
  id: string;
  label: string;
}

export interface LanguageOption {
  code: string;
  label: string;
}

export interface SttProvider {
  id: string;
  name: string;
  models: VoiceOption[];
  languages: LanguageOption[];
  apiKeyDocsUrl: string;
}

export interface TtsProvider extends SttProvider {
  voices: VoiceOption[];
}

export type TurnDetectionModel = 'multilingual' | 'vad_only' | 'stt_endpointing';
export type BargeInMode = 'adaptive' | 'always' | 'never';
export type EndpointingMode = 'dynamic' | 'static';

/** Everything the create wizard collects. Durations are in the unit the form shows (see each field). */
export interface VoiceAgentSettings {
  displayName: string;
  description: string;
  targetAgentWsUrl: string;

  liveKitUrl: string;
  liveKitApiKey: string;
  liveKitApiSecret: string;

  sttProvider: string;
  sttModel: string;
  sttLanguage: string;
  sttApiKey: string;

  ttsProvider: string;
  ttsModel: string;
  ttsVoiceId: string;
  /** Used when `ttsVoiceId` is `custom`. */
  ttsCustomVoiceId: string;
  ttsLanguage: string;
  ttsApiKey: string;

  turnDetectionModel: TurnDetectionModel;
  bargeInMode: BargeInMode;
  bargeInMinDuration: number;
  bargeInMinWords: number;
  endpointingMode: EndpointingMode;
  /** Milliseconds. */
  endpointingMinDelay: number;
  /** Milliseconds. */
  endpointingMaxDelay: number;
  textOutputEnabled: boolean;
  /** Seconds. */
  userAwayTimeout: number;
  closeOnParticipantDisconnect: boolean;
  noiseCancellationEnabled: boolean;
  vadActivationThreshold: number;
  vadDeactivationThreshold: number;
  /** Seconds. */
  vadMinSpeechDuration: number;
  /** Seconds. */
  vadMinSilenceDuration: number;
  corsAllowedOrigins: string;
  /** Seconds. */
  tokenTtl: number;
}

/** The body of `POST /components/{c}/deploy-voice-agent`: plain env vars and the provider keys, kept apart. */
export interface VoiceAgentDeployment {
  config: Record<string, string>;
  secrets: Record<string, string>;
}

export interface CreateVoiceAgentInput {
  orgHandler: string;
  projectId: string;
  settings: VoiceAgentSettings;
}
