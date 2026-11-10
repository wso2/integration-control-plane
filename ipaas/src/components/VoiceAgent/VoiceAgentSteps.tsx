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

import { Accordion, AccordionDetails, AccordionSummary, Box, FormControl, FormControlLabel, FormLabel, IconButton, InputAdornment, Link, Radio, RadioGroup, MenuItem, Stack, Switch, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ExternalLink, Eye, EyeOff } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactNode } from 'react';
import { CUSTOM_VOICE_ID, STT_PROVIDERS, TTS_PROVIDERS } from '../../constants/voiceAgentProviders';
import type { BargeInMode, EndpointingMode, TurnDetectionModel, VoiceAgentSettings } from '../../types/voiceAgent';
import { helperText, type StepErrors, withSttProvider, withTtsProvider } from '../../utils/voiceAgent';
import ProviderPicker from './ProviderPicker';
import * as styles from './VoiceAgentSteps.styles';

export interface VoiceAgentStepProps {
  settings: VoiceAgentSettings;
  errors: StepErrors;
  onChange: (patch: Partial<VoiceAgentSettings>) => void;
  onReplace: (next: VoiceAgentSettings) => void;
}

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
      helperText={helperText(error, hint)}
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
    <Stack gap={2} sx={styles.fieldStackSx}>
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
        <Link href={LIVEKIT_CREDENTIALS_DOCS_URL} target="_blank" rel="noopener noreferrer" variant="body2" sx={styles.linkSx}>
          How to get your LiveKit URL, API key and secret?
          <ExternalLink size={14} />
        </Link>
      </Stack>
      <SecretField label="API key" value={settings.liveKitApiKey} onChange={(liveKitApiKey) => onChange({ liveKitApiKey })} error={errors.liveKitApiKey} />
      <SecretField label="API secret" value={settings.liveKitApiSecret} onChange={(liveKitApiSecret) => onChange({ liveKitApiSecret })} error={errors.liveKitApiSecret} hint="Stored as a secret. It cannot be read back." />
    </Stack>
  );
}

interface OptionSelectProps {
  label: string;
  placeholder: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}

function OptionSelect({ label, placeholder, value, options, onChange }: OptionSelectProps): JSX.Element {
  return (
    <TextField
      labelPlacement="top"
      select
      label={label}
      fullWidth
      disabled={options.length === 0}
      value={options.length ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{ select: { displayEmpty: true, renderValue: (v) => (v ? options.find((o) => o.value === v)?.label : <Typography color="text.disabled">{placeholder}</Typography>) } }}>
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
    <Link href={href} target="_blank" rel="noopener noreferrer" variant="body2" sx={styles.docsLinkSx}>
      How to get your {name} API key?
      <ExternalLink size={14} />
    </Link>
  );
}

export function SttStep({ settings, errors, onChange, onReplace }: VoiceAgentStepProps): JSX.Element {
  const provider = STT_PROVIDERS.find((p) => p.id === settings.sttProvider);
  return (
    <Stack gap={3} sx={styles.formSx}>
      <ProviderPicker label="Speech-to-text provider" providers={STT_PROVIDERS} value={settings.sttProvider} onSelect={(id) => onReplace(withSttProvider(settings, id))} error={errors.sttProvider} />
      <Box sx={styles.rowSx(2)}>
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
    <Stack gap={3} sx={styles.formSx}>
      <ProviderPicker label="Text-to-speech provider" providers={TTS_PROVIDERS} value={settings.ttsProvider} onSelect={(id) => onReplace(withTtsProvider(settings, id))} error={errors.ttsProvider} />
      <Box sx={styles.rowSx(3)}>
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
          helperText={helperText(errors.ttsCustomVoiceId, `The voice's ID in ${provider.name}.`)}
        />
      )}
      <SecretField label={provider ? `${provider.name} API key` : 'API key'} value={settings.ttsApiKey} onChange={(ttsApiKey) => onChange({ ttsApiKey })} error={errors.ttsApiKey} hint="Stored as a secret. It cannot be read back." />
      {provider && <ApiKeyDocsLink name={provider.name} href={provider.apiKeyDocsUrl} />}
    </Stack>
  );
}

const TURN_DETECTION_OPTIONS: { value: TurnDetectionModel; label: string }[] = [
  { value: 'multilingual', label: 'Turn detector model - MultilingualModel' },
  { value: 'vad_only', label: 'VAD only' },
  { value: 'stt_endpointing', label: 'STT endpointing' },
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

type NumericField = {
  [K in keyof VoiceAgentSettings]: VoiceAgentSettings[K] extends number ? K : never;
}[keyof VoiceAgentSettings];

type ToggleField = {
  [K in keyof VoiceAgentSettings]: VoiceAgentSettings[K] extends boolean ? K : never;
}[keyof VoiceAgentSettings];

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Stack gap={1.5}>
      <Typography variant="subtitle1" fontWeight={600}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

function SubSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Stack gap={1.5}>
      <Typography variant="subtitle2" color="text.secondary">
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

export function TuningStep({ settings, errors, onChange }: VoiceAgentStepProps): JSX.Element {
  const num = (field: NumericField, label: string, unit?: string, short = true) => (
    <TextField
      labelPlacement="top"
      label={label}
      type="number"
      fullWidth
      sx={short ? styles.shortFieldSx : undefined}
      value={Number.isNaN(settings[field]) ? '' : settings[field]}
      onChange={(e) => onChange({ [field]: numberValue(e.target.value) })}
      error={!!errors[field]}
      helperText={helperText(errors[field])}
      InputProps={unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined}
    />
  );
  const toggle = (field: ToggleField, label: string) => <FormControlLabel labelPlacement="start" sx={styles.toggleSx} control={<Switch checked={settings[field]} onChange={(e) => onChange({ [field]: e.target.checked })} />} label={label} />;
  const select = <T extends string>(label: string, value: T, options: { value: T; label: string }[], set: (v: T) => void) => (
    <TextField labelPlacement="top" select label={label} fullWidth value={value} onChange={(e) => set(e.target.value as T)} helperText=" ">
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <Stack gap={4} sx={styles.formSx}>
      <Section title="Text output">{toggle('textOutputEnabled', 'Text output / transcription')}</Section>

      <Section title="User interaction and timing">
        {num('userAwayTimeout', 'User away timeout', 's')}
        {num('minConsecutiveSpeechDelay', 'Min consecutive speech delay', 'ms')}
      </Section>

      <Section title="Session cleanup and lifecycle">{toggle('closeOnParticipantDisconnect', 'Close on participant disconnect')}</Section>

      <Section title="Security and access">
        <TextField
          labelPlacement="top"
          label="CORS allowed origins"
          fullWidth
          value={settings.corsAllowedOrigins}
          onChange={(e) => onChange({ corsAllowedOrigins: e.target.value })}
          error={!!errors.corsAllowedOrigins}
          helperText={helperText(errors.corsAllowedOrigins, 'Comma-separated origins that may request a room token from a browser. * allows any.')}
        />
        {num('tokenTtl', 'Token time-to-live (TTL)', 's')}
      </Section>

      <Accordion disableGutters variant="outlined">
        <AccordionSummary expandIcon={<ChevronDown size={16} />}>
          <Typography variant="subtitle1" fontWeight={600}>
            Advanced settings
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack gap={4}>
            <SubSection title="Voice activity detection (VAD)">
              <Box sx={styles.pairSx}>
                {num('vadMinSpeechDuration', 'Min speech duration', 's')}
                {num('vadMinSilenceDuration', 'Min silence duration', 's')}
                {num('vadPrefixPaddingDuration', 'Prefix padding duration', 's')}
                {num('vadActivationThreshold', 'Activation threshold', undefined, false)}
                {num('vadDeactivationThreshold', 'Deactivation threshold', undefined, false)}
                {num('vadMaxBufferedSpeech', 'Max buffered speech', 's')}
              </Box>
              {toggle('noiseCancellationEnabled', 'Noise cancellation')}
            </SubSection>

            <SubSection title="Turn detection and interruptions">
              <FormControl>
                <FormLabel id="turn-detection-label">Turn detection</FormLabel>
                <RadioGroup aria-labelledby="turn-detection-label" value={settings.turnDetectionModel} onChange={(e) => onChange({ turnDetectionModel: e.target.value as TurnDetectionModel })}>
                  {TURN_DETECTION_OPTIONS.map((o) => (
                    <FormControlLabel key={o.value} value={o.value} control={<Radio size="small" />} label={o.label} />
                  ))}
                </RadioGroup>
              </FormControl>

              <Typography variant="body2" fontWeight={600}>
                Barge-in / interruptions
              </Typography>
              {select('Mode', settings.bargeInMode, BARGE_IN_OPTIONS, (bargeInMode) => onChange({ bargeInMode }))}
              <Box sx={styles.pairSx}>
                {num('bargeInMinDuration', 'Min duration', 's')}
                {num('bargeInMinWords', 'Min words', undefined, false)}
              </Box>
              {toggle('discardAudioIfUninterruptible', 'Discard audio if uninterruptible')}

              <Typography variant="body2" fontWeight={600}>
                Endpointing delay
              </Typography>
              {select('Mode', settings.endpointingMode, ENDPOINTING_OPTIONS, (endpointingMode) => onChange({ endpointingMode }))}
              <Box sx={styles.pairSx}>
                {num('endpointingMinDelay', 'Min delay', 'ms')}
                {num('endpointingMaxDelay', 'Max delay', 'ms')}
              </Box>
            </SubSection>
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
