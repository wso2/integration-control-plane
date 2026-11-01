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

import { Box, Button, FormControlLabel, IconButton, Radio, RadioGroup, Stack, Typography, TextField } from '@wso2/oxygen-ui';
import { Plus, X } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import StringArrayInput from '../common/StringArrayInput';
import { PROBE_TYPE, type HttpHeader, type ProbeType } from '../../types/healthChecks';
import { REQUIRED_ERROR, validatePath, validatePort, type ProbeFormState } from '../../utils/healthChecks';

/** The required numeric Port field shared by the HTTP GET and TCP probe forms. */
function PortField({ value, onChange, onBlur, error }: { value: string; onChange: (value: string) => void; onBlur: () => void; error?: string }): JSX.Element {
  return <TextField labelPlacement="top" label="Port" required size="small" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} inputProps={{ inputMode: 'numeric' }} sx={{ width: 120 }} error={!!error} helperText={error ?? ' '} />;
}

interface ProbeConfigFieldsProps {
  kind: string;
  form: ProbeFormState;
  onChange: (patch: Partial<ProbeFormState>) => void;
}

const DESC: Record<string, string> = {
  httpGet: 'The probe will send an HTTP GET request to the container on the specified port and path. Only response status codes between 200 and 399 are considered a success.',
  tcp: 'The probe will attempt to open a socket to the container on the specified port. If it cannot establish a TCP connection it will be considered a failure.',
  exec: 'The probe will execute the given script inside the container. A non-zero return from the command will be considered a failure.',
};

export default function ProbeConfigFields({ kind, form, onChange }: ProbeConfigFieldsProps): JSX.Element {
  const setHeaders = (headers: HttpHeader[]): void => onChange({ httpHeaders: headers });
  // Only surface a required/format error once the field has been touched (Devant behaviour).
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (key: string) => (): void => setTouched((prev) => ({ ...prev, [key]: true }));
  const shownErr = (key: string, err: string | undefined): string | undefined => (touched[key] ? err : undefined);

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        Select {kind} Probe Type:
      </Typography>
      <RadioGroup row value={form.type} onChange={(e) => onChange({ type: e.target.value as Exclude<ProbeType, ''> })} sx={{ mb: 2 }}>
        <FormControlLabel value={PROBE_TYPE.HTTP_GET} control={<Radio />} label="HTTP GET Request" />
        <FormControlLabel value={PROBE_TYPE.TCP} control={<Radio />} label="TCP Probe" />
        <FormControlLabel value={PROBE_TYPE.EXEC} control={<Radio />} label="Execute a Command" />
      </RadioGroup>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {DESC[form.type]}
      </Typography>

      {form.type === PROBE_TYPE.HTTP_GET && (
        <>
          <Stack direction="row" gap={2} sx={{ mb: 2 }}>
            <PortField value={form.port} onChange={(v) => onChange({ port: v })} onBlur={touch('port')} error={shownErr('port', validatePort(form.port))} />
            <TextField
              labelPlacement="top"
              label="Path"
              required
              size="small"
              value={form.path}
              onChange={(e) => onChange({ path: e.target.value })}
              onBlur={touch('path')}
              sx={{ flex: 1 }}
              error={!!shownErr('path', validatePath(form.path))}
              helperText={shownErr('path', validatePath(form.path)) ?? ' '}
            />
          </Stack>
          <Stack gap={1.5} sx={{ mb: 1.5 }}>
            {form.httpHeaders.map((h, i) => (
              <Stack key={i} direction="row" gap={1.5} alignItems="flex-start">
                <TextField
                  labelPlacement="top"
                  label="Header Key"
                  required
                  size="small"
                  value={h.name}
                  onChange={(e) => setHeaders(form.httpHeaders.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  onBlur={touch(`hk${i}`)}
                  sx={{ flex: 1 }}
                  error={!!shownErr(`hk${i}`, h.name.trim() === '' ? REQUIRED_ERROR : undefined)}
                  helperText={shownErr(`hk${i}`, h.name.trim() === '' ? REQUIRED_ERROR : undefined) ?? ' '}
                />
                <TextField
                  labelPlacement="top"
                  label="Header Value"
                  required
                  size="small"
                  value={h.value}
                  onChange={(e) => setHeaders(form.httpHeaders.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  onBlur={touch(`hv${i}`)}
                  sx={{ flex: 1 }}
                  error={!!shownErr(`hv${i}`, h.value.trim() === '' ? REQUIRED_ERROR : undefined)}
                  helperText={shownErr(`hv${i}`, h.value.trim() === '' ? REQUIRED_ERROR : undefined) ?? ' '}
                />
                <IconButton aria-label={`Remove header ${i + 1}`} sx={{ mt: 0.5 }} onClick={() => setHeaders(form.httpHeaders.filter((_, j) => j !== i))}>
                  <X size={16} />
                </IconButton>
              </Stack>
            ))}
          </Stack>
          <Button variant="outlined" size="small" startIcon={<Plus size={16} />} onClick={() => setHeaders([...form.httpHeaders, { name: '', value: '' }])}>
            Add HTTP Header
          </Button>
        </>
      )}

      {form.type === PROBE_TYPE.TCP && <PortField value={form.port} onChange={(v) => onChange({ port: v })} onBlur={touch('port')} error={shownErr('port', validatePort(form.port))} />}

      {form.type === PROBE_TYPE.EXEC && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontFamily: 'monospace' }}>
            Eg. [&quot;cat&quot;, &quot;/tmp/healthy&quot;]
          </Typography>
          <StringArrayInput label="Command" value={form.command} onChange={(command) => onChange({ command })} addLabel="Add Command" />
        </Box>
      )}
    </Box>
  );
}
