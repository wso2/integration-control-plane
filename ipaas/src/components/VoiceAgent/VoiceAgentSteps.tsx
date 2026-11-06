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

import { Accordion, AccordionDetails, AccordionSummary, FormControlLabel, Link, MenuItem, Stack, Switch, TextField, Typography } from '@wso2/oxygen-ui';
import { ChevronDown } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { CUSTOM_VOICE_ID, STT_PROVIDERS, TTS_PROVIDERS } from '../../constants/voiceAgentProviders';
import type { BargeInMode, EndpointingMode, TurnDetectionModel, VoiceAgentSettings } from '../../types/voiceAgent';
import { withSttProvider, withTtsProvider, type StepErrors } from '../../utils/voiceAgent';

export interface VoiceAgentStepProps {
  settings: VoiceAgentSettings;
  errors: StepErrors;
  /** Merges the given fields into the settings. */
  onChange: (patch: Partial<VoiceAgentSettings>) => void;
  /** Replaces the settings: provider changes reset the dependent fields together. */
  onReplace: (next: VoiceAgentSettings) => void;
}

const FIELD_STACK_SX = { maxWidth: 560 } as const;

/** Keeps an error message reserved, so the form does not shift as errors come and go. */
const help = (error: string | undefined, hint = ' '): string => error ?? hint;

const numberValue = (raw: string): number => (raw.trim() === '' ? Number.NaN : Number(raw));

export function LiveKitStep({ settings, errors, onChange }: VoiceAgentStepProps): JSX.Element {
  return (
    <Stack gap={2} sx={FIELD_STACK_SX}>
      <Typography variant="body2" color="text.secondary">
        Calls run in your LiveKit project. Find these values under Settings › Keys in LiveKit Cloud.
      </Typography>
      <TextField
        labelPlacement="top"
        label="LiveKit URL"
        placeholder="wss://your-project.livekit.cloud"
        fullWidth
        value={settings.liveKitUrl}
        onChange={(e) => onChange({ liveKitUrl: e.target.value })}
        error={!!errors.liveKitUrl}
        helperText={help(errors.liveKitUrl)}
      />
      <TextField labelPlacement="top" label="API key" fullWidth autoComplete="off" value={settings.liveKitApiKey} onChange={(e) => onChange({ liveKitApiKey: e.target.value })} error={!!errors.liveKitApiKey} helperText={help(errors.liveKitApiKey)} />
      <TextField
        labelPlacement="top"
        label="API secret"
        type="password"
        fullWidth
        autoComplete="new-password"
        value={settings.liveKitApiSecret}
        onChange={(e) => onChange({ liveKitApiSecret: e.target.value })}
        error={!!errors.liveKitApiSecret}
        helperText={help(errors.liveKitApiSecret, 'Stored as a secret. It cannot be read back.')}
      />
    </Stack>
  );
}

export function SttStep({ settings, errors, onChange, onReplace }: VoiceAgentStepProps): JSX.Element {
  const provider = STT_PROVIDERS.find((p) => p.id === settings.sttProvider);
  return (
    <Stack gap={2} sx={FIELD_STACK_SX}>
      <TextField labelPlacement="top" select label="Provider" fullWidth value={settings.sttProvider} onChange={(e) => onReplace(withSttProvider(settings, e.target.value))} error={!!errors.sttProvider} helperText={help(errors.sttProvider)}>
        {STT_PROVIDERS.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>
      {provider && (
        <>
          <TextField labelPlacement="top" select label="Model" fullWidth value={settings.sttModel} onChange={(e) => onChange({ sttModel: e.target.value })} helperText=" ">
            {provider.models.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField labelPlacement="top" select label="Language" fullWidth value={settings.sttLanguage} onChange={(e) => onChange({ sttLanguage: e.target.value })} helperText=" ">
            {provider.languages.map((l) => (
              <MenuItem key={l.code} value={l.code}>
                {l.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            labelPlacement="top"
            label={`${provider.name} API key`}
            type="password"
            fullWidth
            autoComplete="new-password"
            value={settings.sttApiKey}
            onChange={(e) => onChange({ sttApiKey: e.target.value })}
            error={!!errors.sttApiKey}
            helperText={help(errors.sttApiKey, 'Stored as a secret. It cannot be read back.')}
          />
          <Link href={provider.apiKeyDocsUrl} target="_blank" rel="noopener noreferrer" variant="body2">
            Get a {provider.name} API key
          </Link>
        </>
      )}
    </Stack>
  );
}

export function TtsStep({ settings, errors, onChange, onReplace }: VoiceAgentStepProps): JSX.Element {
  const provider = TTS_PROVIDERS.find((p) => p.id === settings.ttsProvider);
  return (
    <Stack gap={2} sx={FIELD_STACK_SX}>
      <TextField labelPlacement="top" select label="Provider" fullWidth value={settings.ttsProvider} onChange={(e) => onReplace(withTtsProvider(settings, e.target.value))} error={!!errors.ttsProvider} helperText={help(errors.ttsProvider)}>
        {TTS_PROVIDERS.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>
      {provider && (
        <>
          <TextField labelPlacement="top" select label="Model" fullWidth value={settings.ttsModel} onChange={(e) => onChange({ ttsModel: e.target.value })} helperText=" ">
            {provider.models.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField labelPlacement="top" select label="Voice" fullWidth value={settings.ttsVoiceId} onChange={(e) => onChange({ ttsVoiceId: e.target.value })} helperText=" ">
            {provider.voices.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.label}
              </MenuItem>
            ))}
          </TextField>
          {settings.ttsVoiceId === CUSTOM_VOICE_ID && (
            <TextField
              labelPlacement="top"
              label="Voice ID"
              fullWidth
              value={settings.ttsCustomVoiceId}
              onChange={(e) => onChange({ ttsCustomVoiceId: e.target.value })}
              error={!!errors.ttsCustomVoiceId}
              helperText={help(errors.ttsCustomVoiceId, `The voice's ID in ${provider.name}.`)}
            />
          )}
          <TextField labelPlacement="top" select label="Language" fullWidth value={settings.ttsLanguage} onChange={(e) => onChange({ ttsLanguage: e.target.value })} helperText=" ">
            {provider.languages.map((l) => (
              <MenuItem key={l.code} value={l.code}>
                {l.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            labelPlacement="top"
            label={`${provider.name} API key`}
            type="password"
            fullWidth
            autoComplete="new-password"
            value={settings.ttsApiKey}
            onChange={(e) => onChange({ ttsApiKey: e.target.value })}
            error={!!errors.ttsApiKey}
            helperText={help(errors.ttsApiKey, 'Stored as a secret. It cannot be read back.')}
          />
          <Link href={provider.apiKeyDocsUrl} target="_blank" rel="noopener noreferrer" variant="body2">
            Get a {provider.name} API key
          </Link>
        </>
      )}
    </Stack>
  );
}

const TURN_DETECTION_OPTIONS: { value: TurnDetectionModel; label: string }[] = [
  { value: 'multilingual', label: 'Turn-detection model (multilingual)' },
  { value: 'vad_only', label: 'Voice activity only' },
  { value: 'stt_endpointing', label: 'Speech-to-text endpointing' },
];

const BARGE_IN_OPTIONS: { value: BargeInMode; label: string }[] = [
  { value: 'always', label: 'Always' },
  { value: 'adaptive', label: 'Adaptive (LiveKit Cloud only)' },
  { value: 'never', label: 'Never' },
];

const ENDPOINTING_OPTIONS: { value: EndpointingMode; label: string }[] = [
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'static', label: 'Fixed' },
];

export function TuningStep({ settings, errors, onChange }: VoiceAgentStepProps): JSX.Element {
  const num = (field: keyof VoiceAgentSettings, label: string, hint = ' ') => (
    <TextField
      labelPlacement="top"
      label={label}
      type="number"
      fullWidth
      value={Number.isNaN(settings[field] as number) ? '' : (settings[field] as number)}
      onChange={(e) => onChange({ [field]: numberValue(e.target.value) })}
      error={!!errors[field]}
      helperText={help(errors[field], hint)}
    />
  );
  return (
    <Stack gap={2} sx={FIELD_STACK_SX}>
      <TextField
        labelPlacement="top"
        select
        label="Turn detection"
        fullWidth
        value={settings.turnDetectionModel}
        onChange={(e) => onChange({ turnDetectionModel: e.target.value as TurnDetectionModel })}
        helperText="How the agent decides the caller has finished speaking.">
        {TURN_DETECTION_OPTIONS.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField labelPlacement="top" select label="Interruptions" fullWidth value={settings.bargeInMode} onChange={(e) => onChange({ bargeInMode: e.target.value as BargeInMode })} helperText="Whether the caller can talk over the agent.">
        {BARGE_IN_OPTIONS.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField labelPlacement="top" select label="Endpointing" fullWidth value={settings.endpointingMode} onChange={(e) => onChange({ endpointingMode: e.target.value as EndpointingMode })} helperText=" ">
        {ENDPOINTING_OPTIONS.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction="row" gap={2}>
        {num('endpointingMinDelay', 'Minimum delay (ms)')}
        {num('endpointingMaxDelay', 'Maximum delay (ms)')}
      </Stack>
      {num('userAwayTimeout', 'Idle timeout (seconds)', 'Ends the call after this long without speech.')}
      <FormControlLabel control={<Switch checked={settings.textOutputEnabled} onChange={(e) => onChange({ textOutputEnabled: e.target.checked })} />} label="Send transcripts to the caller" />
      <FormControlLabel control={<Switch checked={settings.closeOnParticipantDisconnect} onChange={(e) => onChange({ closeOnParticipantDisconnect: e.target.checked })} />} label="End the session when the caller leaves" />
      <FormControlLabel control={<Switch checked={settings.noiseCancellationEnabled} onChange={(e) => onChange({ noiseCancellationEnabled: e.target.checked })} />} label="Noise cancellation (LiveKit Cloud only)" />
      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ChevronDown size={16} />}>
          <Typography variant="subtitle2">Advanced</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack gap={2}>
            <Stack direction="row" gap={2}>
              {num('vadActivationThreshold', 'Speech start threshold')}
              {num('vadDeactivationThreshold', 'Speech end threshold')}
            </Stack>
            <Stack direction="row" gap={2}>
              {num('vadMinSpeechDuration', 'Minimum speech (seconds)')}
              {num('vadMinSilenceDuration', 'Minimum silence (seconds)')}
            </Stack>
            <Stack direction="row" gap={2}>
              {num('bargeInMinDuration', 'Interruption minimum (seconds)')}
              {num('bargeInMinWords', 'Interruption minimum words')}
            </Stack>
            <TextField
              labelPlacement="top"
              label="Allowed origins"
              fullWidth
              value={settings.corsAllowedOrigins}
              onChange={(e) => onChange({ corsAllowedOrigins: e.target.value })}
              helperText="Comma-separated origins that may request a room token. * allows any."
            />
            {num('tokenTtl', 'Room token lifetime (seconds)')}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
