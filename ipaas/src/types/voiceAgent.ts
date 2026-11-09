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
export type VoiceTargetMode = 'platform' | 'external';

export interface VoiceAgentSettings {
  displayName: string;
  name: string;
  description: string;
  targetMode: VoiceTargetMode;
  targetAgentHandler: string;
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
  ttsCustomVoiceId: string;
  ttsLanguage: string;
  ttsApiKey: string;

  turnDetectionModel: TurnDetectionModel;
  bargeInMode: BargeInMode;
  bargeInMinDuration: number;
  bargeInMinWords: number;
  discardAudioIfUninterruptible: boolean;
  endpointingMode: EndpointingMode;
  endpointingMinDelay: number;
  endpointingMaxDelay: number;
  textOutputEnabled: boolean;
  userAwayTimeout: number;
  minConsecutiveSpeechDelay: number;
  closeOnParticipantDisconnect: boolean;
  noiseCancellationEnabled: boolean;
  vadActivationThreshold: number;
  vadDeactivationThreshold: number;
  vadMinSpeechDuration: number;
  vadMinSilenceDuration: number;
  vadPrefixPaddingDuration: number;
  vadMaxBufferedSpeech: number;
  corsAllowedOrigins: string;
  tokenTtl: number;
}

export interface VoiceAgentDeployment {
  config: Record<string, string>;
  secrets: Record<string, string>;
}

export interface CreateVoiceAgentInput {
  orgHandler: string;
  projectId: string;
  settings: VoiceAgentSettings;
}
