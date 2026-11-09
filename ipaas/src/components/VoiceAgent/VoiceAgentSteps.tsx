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

import { Accordion, AccordionDetails, AccordionSummary, Box, FormControlLabel, IconButton, Link, MenuItem, Stack, Switch, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ExternalLink, Eye, EyeOff } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { CUSTOM_VOICE_ID, STT_PROVIDERS, TTS_PROVIDERS } from '../../constants/voiceAgentProviders';
import type { BargeInMode, EndpointingMode, TurnDetectionModel, VoiceAgentSettings } from '../../types/voiceAgent';
import { withSttProvider, withTtsProvider, type StepErrors } from '../../utils/voiceAgent';
import ProviderPicker from './ProviderPicker';

export interface VoiceAgentStepProps {
  settings: VoiceAgentSettings;
  errors: StepErrors;
  onChange: (patch: Partial<VoiceAgentSettings>) => void;
  onReplace: (next: VoiceAgentSettings) => void;
}

const FIELD_STACK_SX = { maxWidth: 560 } as const;

const help = (error: string | undefined, hint = ' '): string => error ?? hint;

const LIVEKIT_CREDENTIALS_DOCS_URL = 'https://docs.livekit.io/deploy/agents/secrets/#livekit-credentials';

interface SecretFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}

function SecretField({ label, value, onChange, error, hint }: SecretFieldProps): JSX.Element {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`;
  return (
    <TextField
      labelPlacement="top"
      label={label}
      type={visible ? 'text' : 'password'}
      fullWidth
      autoComplete="new-password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={!!error}
      helperText={help(error, hint)}
      InputProps={{
        endAdornment: (
          <Tooltip title={toggleLabel}>
            <IconButton aria-label={toggleLabel} size="small" onClick={() => setVisible((v) => !v)}>
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </IconButton>
          </Tooltip>
        ),
      }}
    />
  );
}

const numberValue = (raw: string): number => (raw.trim() === '' ? Number.NaN : Number(raw));

export function LiveKitStep({ settings, errors, onChange }: VoiceAgentStepProps): JSX.Element {
  return (
    <Stack gap={2} sx={FIELD_STACK_SX}>
      <Stack gap={0.5}>
        <TextField
          labelPlacement="top"
          label="LiveKit URL"
          placeholder="wss://your-project.livekit.cloud"
          fullWidth
          value={settings.liveKitUrl}
          onChange={(e) => onChange({ liveKitUrl: e.target.value })}
          error={!!errors.liveKitUrl}
          helperText={errors.liveKitUrl}
        />
        <Link href={LIVEKIT_CREDENTIALS_DOCS_URL} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          How to get your LiveKit URL, API key and secret?
          <ExternalLink size={14} />
        </Link>
      </Stack>
      <SecretField label="API key" value={settings.liveKitApiKey} onChange={(liveKitApiKey) => onChange({ liveKitApiKey })} error={errors.liveKitApiKey} />
      <SecretField label="API secret" value={settings.liveKitApiSecret} onChange={(liveKitApiSecret) => onChange({ liveKitApiSecret })} error={errors.liveKitApiSecret} hint="Stored as a secret. It cannot be read back." />
    </Stack>
  );
}

const PROVIDER_FORM_SX = { maxWidth: 1040 } as const;
const ROW_SX = (columns: number) => ({ display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${columns}, 1fr)` }, gap: 2 }) as const;
const LINK_SX = { display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: -1 } as const;

interface OptionSelectProps {
  label: string;
  placeholder: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}

function OptionSelect({ label, placeholder, value, options, onChange }: OptionSelectProps): JSX.Element {
  return (
    <TextField labelPlacement="top" select label={label} fullWidth disabled={options.length === 0} value={options.length ? value : ''} onChange={(e) => onChange(e.target.value)} slotProps={{ select: { displayEmpty: true, renderValue: (v) => (v ? options.find((o) => o.value === v)?.label : <Typography color="text.disabled">{placeholder}</Typography>) } }}>
      <MenuItem value="" disabled>
        {placeholder}
      </MenuItem>
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

function ApiKeyDocsLink({ name, href }: { name: string; href: string }): JSX.Element {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" variant="body2" sx={LINK_SX}>
      How to get your {name} API key?
      <ExternalLink size={14} />
    </Link>
  );
}

export function SttStep({ settings, errors, onChange, onReplace }: VoiceAgentStepProps): JSX.Element {
  const provider = STT_PROVIDERS.find((p) => p.id === settings.sttProvider);
  return (
    <Stack gap={3} sx={PROVIDER_FORM_SX}>
      <ProviderPicker label="Speech-to-text provider" providers={STT_PROVIDERS} value={settings.sttProvider} onSelect={(id) => onReplace(withSttProvider(settings, id))} error={errors.sttProvider} />
      <Box sx={ROW_SX(2)}>
        <OptionSelect label="Model" placeholder="Select model" value={settings.sttModel} options={(provider?.models ?? []).map((m) => ({ value: m.id, label: m.label }))} onChange={(sttModel) => onChange({ sttModel })} />
        <OptionSelect label="Language" placeholder="Select language" value={settings.sttLanguage} options={(provider?.languages ?? []).map((l) => ({ value: l.code, label: l.label }))} onChange={(sttLanguage) => onChange({ sttLanguage })} />
      </Box>
      <SecretField label={provider ? `${provider.name} API key` : 'API key'} value={settings.sttApiKey} onChange={(sttApiKey) => onChange({ sttApiKey })} error={errors.sttApiKey} hint="Stored as a secret. It cannot be read back." />
      {provider && <ApiKeyDocsLink name={provider.name} href={provider.apiKeyDocsUrl} />}
    </Stack>
  );
}

export function TtsStep({ settings, errors, onChange, onReplace }: VoiceAgentStepProps): JSX.Element {
  const provider = TTS_PROVIDERS.find((p) => p.id === settings.ttsProvider);
  return (
    <Stack gap={3} sx={PROVIDER_FORM_SX}>
      <ProviderPicker label="Text-to-speech provider" providers={TTS_PROVIDERS} value={settings.ttsProvider} onSelect={(id) => onReplace(withTtsProvider(settings, id))} error={errors.ttsProvider} />
      <Box sx={ROW_SX(3)}>
        <OptionSelect label="Model" placeholder="Select model" value={settings.ttsModel} options={(provider?.models ?? []).map((m) => ({ value: m.id, label: m.label }))} onChange={(ttsModel) => onChange({ ttsModel })} />
        <OptionSelect label="Voice" placeholder="Select voice" value={settings.ttsVoiceId} options={(provider?.voices ?? []).map((v) => ({ value: v.id, label: v.label }))} onChange={(ttsVoiceId) => onChange({ ttsVoiceId })} />
        <OptionSelect label="Language" placeholder="Select language" value={settings.ttsLanguage} options={(provider?.languages ?? []).map((l) => ({ value: l.code, label: l.label }))} onChange={(ttsLanguage) => onChange({ ttsLanguage })} />
      </Box>
      {provider && settings.ttsVoiceId === CUSTOM_VOICE_ID && (
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
      <SecretField label={provider ? `${provider.name} API key` : 'API key'} value={settings.ttsApiKey} onChange={(ttsApiKey) => onChange({ ttsApiKey })} error={errors.ttsApiKey} hint="Stored as a secret. It cannot be read back." />
      {provider && <ApiKeyDocsLink name={provider.name} href={provider.apiKeyDocsUrl} />}
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
