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

import type { SttProvider, TtsProvider } from '../types/voiceAgent';

export const CUSTOM_VOICE_ID = 'custom';

export const STT_PROVIDERS: SttProvider[] = [
  {
    id: 'deepgram',
    name: 'Deepgram',
    apiKeyDocsUrl: 'https://developers.deepgram.com/docs/create-additional-api-keys',
    models: [
      { id: 'deepgram/nova-3-general', label: 'Nova-3 (monolingual, 45 languages)' },
      { id: 'deepgram/nova-3-medical', label: 'Nova-3 Medical (English)' },
      { id: 'deepgram/nova-3-multilingual', label: 'Nova-3 (multilingual)' },
      { id: 'deepgram/nova-2-general', label: 'Nova-2 (multilingual, 33 languages)' },
      { id: 'deepgram/nova-2-conversationalai', label: 'Nova-2 Conversational AI' },
      { id: 'deepgram/flux-general', label: 'Flux (English)' },
      { id: 'deepgram/flux-multilingual', label: 'Flux (multilingual)' },
    ],
    languages: [
      { code: 'en', label: 'English' },
      { code: 'hi', label: 'Hindi' },
      { code: 'es', label: 'Spanish' },
      { code: 'fr', label: 'French' },
      { code: 'de', label: 'German' },
      { code: 'it', label: 'Italian' },
      { code: 'pt', label: 'Portuguese' },
      { code: 'ja', label: 'Japanese' },
      { code: 'ko', label: 'Korean' },
      { code: 'zh', label: 'Chinese' },
      { code: 'multi', label: 'Multilingual (auto-detect)' },
    ],
  },
  {
    id: 'assemblyai',
    name: 'AssemblyAI',
    apiKeyDocsUrl: 'https://www.assemblyai.com/docs/getting-started/transcribe-an-audio-file',
    models: [
      { id: 'assemblyai/u3-rt-pro', label: 'Universal-3 Pro Streaming' },
      { id: 'assemblyai/universal-streaming', label: 'Universal Streaming (English)' },
      { id: 'assemblyai/universal-streaming-multilingual', label: 'Universal Streaming Multilingual' },
    ],
    languages: [
      { code: 'en', label: 'English' },
      { code: 'es', label: 'Spanish' },
      { code: 'de', label: 'German' },
      { code: 'fr', label: 'French' },
      { code: 'pt', label: 'Portuguese' },
      { code: 'it', label: 'Italian' },
    ],
  },
  {
    id: 'cartesia',
    name: 'Cartesia',
    apiKeyDocsUrl: 'https://play.cartesia.ai/keys',
    models: [{ id: 'cartesia/ink-whisper', label: 'Ink Whisper (100 languages)' }],
    languages: [
      { code: 'en', label: 'English' },
      { code: 'es', label: 'Spanish' },
      { code: 'fr', label: 'French' },
      { code: 'de', label: 'German' },
      { code: 'multi', label: 'Other (100+ languages)' },
    ],
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    apiKeyDocsUrl: 'https://elevenlabs.io/docs/api-reference/authentication',
    models: [{ id: 'elevenlabs/scribe_v2_realtime', label: 'Scribe v2 Realtime' }],
    languages: [
      { code: 'en', label: 'English' },
      { code: 'es', label: 'Spanish' },
      { code: 'fr', label: 'French' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    apiKeyDocsUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'openai/gpt-4o-mini-transcribe', label: 'GPT-4o Mini Transcribe' },
      { id: 'openai/gpt-4o-transcribe', label: 'GPT-4o Transcribe' },
      { id: 'openai/whisper-1', label: 'Whisper-1' },
    ],
    languages: [
      { code: 'en', label: 'English' },
      { code: 'es', label: 'Spanish' },
      { code: 'fr', label: 'French' },
      { code: 'de', label: 'German' },
      { code: 'hi', label: 'Hindi' },
      { code: 'it', label: 'Italian' },
      { code: 'pt', label: 'Portuguese' },
      { code: 'ja', label: 'Japanese' },
      { code: 'ko', label: 'Korean' },
      { code: 'zh', label: 'Chinese' },
      { code: 'nl', label: 'Dutch' },
      { code: 'pl', label: 'Polish' },
      { code: 'ru', label: 'Russian' },
      { code: 'tr', label: 'Turkish' },
      { code: 'ar', label: 'Arabic' },
      { code: 'multi', label: 'Auto-detect (57 languages)' },
    ],
  },
];

export const TTS_PROVIDERS: TtsProvider[] = [
  {
    id: 'cartesia',
    name: 'Cartesia',
    apiKeyDocsUrl: 'https://play.cartesia.ai/keys',
    models: [
      { id: 'cartesia/sonic-3', label: 'Sonic 3' },
      { id: 'cartesia/sonic-2', label: 'Sonic 2' },
    ],
    voices: [
      { id: 'f786b574-daa5-4673-aa0c-cbe3e8534c02', label: 'Katie (Cartesia default)' },
      { id: CUSTOM_VOICE_ID, label: 'Custom voice ID' },
    ],
    languages: [
      { code: 'en', label: 'English' },
      { code: 'es', label: 'Spanish' },
      { code: 'fr', label: 'French' },
    ],
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    apiKeyDocsUrl: 'https://elevenlabs.io/docs/api-reference/authentication',
    models: [
      { id: 'elevenlabs/eleven_turbo_v2_5', label: 'Eleven Turbo v2.5' },
      { id: 'elevenlabs/eleven_multilingual_v2', label: 'Multilingual v2' },
    ],
    voices: [
      { id: 'rachel', label: 'Rachel' },
      { id: 'antoni', label: 'Antoni' },
      { id: CUSTOM_VOICE_ID, label: 'Custom voice ID' },
    ],
    languages: [
      { code: 'en', label: 'English' },
      { code: 'es', label: 'Spanish' },
      { code: 'fr', label: 'French' },
    ],
  },
  {
    id: 'deepgram',
    name: 'Deepgram',
    apiKeyDocsUrl: 'https://developers.deepgram.com/docs/create-additional-api-keys',
    models: [{ id: 'deepgram/aura-asteria-en', label: 'Aura Asteria' }],
    voices: [{ id: 'aura-asteria-en', label: 'Asteria (English)' }],
    languages: [{ code: 'en', label: 'English' }],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    apiKeyDocsUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'openai/gpt-4o-mini-tts', label: 'GPT-4o Mini TTS' },
      { id: 'openai/tts-1', label: 'TTS-1' },
      { id: 'openai/tts-1-hd', label: 'TTS-1 HD' },
    ],
    voices: [
      { id: 'alloy', label: 'Alloy' },
      { id: 'ash', label: 'Ash' },
      { id: 'ballad', label: 'Ballad' },
      { id: 'coral', label: 'Coral' },
      { id: 'echo', label: 'Echo' },
      { id: 'fable', label: 'Fable' },
      { id: 'nova', label: 'Nova' },
      { id: 'onyx', label: 'Onyx' },
      { id: 'sage', label: 'Sage' },
      { id: 'shimmer', label: 'Shimmer' },
    ],
    languages: [{ code: 'auto', label: 'Auto-detect (57 languages)' }],
  },
];
