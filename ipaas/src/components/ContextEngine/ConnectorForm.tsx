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

import { Alert, Box, Link, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { REQUIRED_FIELD_SX } from '../../constants/styles';
import { sourceFieldError, sourceNameError } from '../../utils/contextEngine';
import SecretField from '../RagIngestion/SecretField';
import SourceMark from './SourceMark';
import { connectorHeaderSx, fieldStackSx } from './styles';
import type { ContextSourceConfig, SourceConnector, SourceFieldDef } from '../../types/contextEngine';

interface ConnectorFormProps {
  connector: SourceConnector;
  draft: ContextSourceConfig;
  /** Names of the other sources, for the uniqueness check. */
  otherNames: string[];
  onChange: (draft: ContextSourceConfig) => void;
  /** Shown as a "Change source" link when adding; absent when editing an existing source. */
  onChangeSource?: () => void;
}

function Field({ def, value, onChange }: { def: SourceFieldDef; value: string; onChange: (value: string) => void }): JSX.Element {
  // Required-but-empty is signalled by the disabled submit button, not red fields on first open.
  const error = value ? sourceFieldError(def, value) : '';
  if (def.kind === 'secret') return <SecretField label={def.label} required={def.required} value={value} placeholder={def.placeholder} onChange={onChange} error={error || undefined} />;
  const multiline = def.kind === 'urls' || def.kind === 'multiline';
  return (
    <TextField
      label={def.label}
      required={def.required}
      fullWidth
      size="small"
      multiline={multiline}
      minRows={multiline ? 3 : undefined}
      value={value}
      placeholder={def.placeholder}
      error={!!error}
      helperText={error || def.helper}
      onChange={(e) => onChange(e.target.value)}
      sx={def.required ? REQUIRED_FIELD_SX : undefined}
    />
  );
}

/** The configuration form for one connector, rendered from its field schema. */
export default function ConnectorForm({ connector, draft, otherNames, onChange, onChangeSource }: ConnectorFormProps): JSX.Element {
  const nameError = sourceNameError(draft.name, otherNames);
  const setValue = (key: string, value: string) => onChange({ ...draft, values: { ...draft.values, [key]: value } });

  return (
    <>
      <Box sx={connectorHeaderSx}>
        <SourceMark type={connector.id} size={24} variant="tile" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {connector.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {connector.description}
          </Typography>
        </Box>
        {onChangeSource && (
          <Link component="button" type="button" variant="body2" onClick={onChangeSource} sx={{ flexShrink: 0 }}>
            Change source
          </Link>
        )}
      </Box>

      <Stack sx={fieldStackSx}>
        <TextField
          label="Source Name"
          required
          fullWidth
          size="small"
          value={draft.name}
          error={!!nameError && draft.name.trim() !== ''}
          helperText={draft.name.trim() !== '' ? nameError || undefined : 'How this source appears in the engine.'}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          sx={REQUIRED_FIELD_SX}
        />
        {connector.fields.map((def) => (
          <Field key={def.key} def={def} value={draft.values[def.key] ?? ''} onChange={(v) => setValue(def.key, v)} />
        ))}
        {connector.fields.length === 0 && (
          <Alert severity="info" variant="outlined">
            Nothing to configure now. You can upload files from the engine's Overview once it is created.
          </Alert>
        )}
      </Stack>
    </>
  );
}
