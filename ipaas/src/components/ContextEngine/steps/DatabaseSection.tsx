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

import { Alert, Box, Button, CircularProgress, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useCheckContextEngineDatabase } from '../../../hooks/useContextEngine';
import { DATABASE_SSL_MODES, ENGINE_DATABASE_LABEL } from '../../../constants/contextEngine';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import { databaseFieldErrors, engineMessage, needsCaCertificate, toExternalDatabase } from '../../../utils/contextEngine';
import SecretField from '../../common/SecretField';
import { databaseChoiceSx, databaseHostRowSx, fieldStackSx, mutedSx, pemFieldSx, storageOptionBodySx, storageOptionSx } from '../styles';
import type { DatabaseChoice, DatabaseField, DatabaseSslMode, EngineDatabaseKind } from '../../../types/contextEngine';

interface DatabaseSectionProps {
  value: DatabaseChoice;
  onChange: (value: DatabaseChoice) => void;
  /** What the managed database is in this deployment; undefined until the BFF says. */
  managedHint?: string;
}

/** Where the engine keeps its data: a server WSO2 Cloud manages, or the user's own PostgreSQL. */
export default function DatabaseSection({ value, onChange, managedHint }: DatabaseSectionProps): JSX.Element {
  const check = useCheckContextEngineDatabase();
  // A missing value is flagged only once the user has left the field.
  const [touched, setTouched] = useState<ReadonlySet<DatabaseField>>(new Set());
  const errors = databaseFieldErrors(value);
  const shown = (field: DatabaseField): string | undefined => (touched.has(field) ? errors[field] : undefined);
  const leave = (field: DatabaseField) => setTouched((t) => new Set(t).add(field));
  // A result belongs to the details it checked; any edit clears it.
  const update = (patch: Partial<DatabaseChoice>) => {
    check.reset();
    onChange({ ...value, ...patch });
  };
  const sslHint = DATABASE_SSL_MODES.find((m) => m.value === value.sslMode)?.hint;

  const text = (field: Exclude<DatabaseField, 'password' | 'caCertificate'>, label: string, placeholder?: string) => (
    <TextField
      labelPlacement="top"
      label={label}
      required
      fullWidth
      size="small"
      value={value[field]}
      placeholder={placeholder}
      error={!!shown(field)}
      helperText={shown(field)}
      onChange={(e) => update({ [field]: e.target.value })}
      onBlur={() => leave(field)}
      sx={REQUIRED_FIELD_SX}
    />
  );

  return (
    <RadioGroup value={value.mode} onChange={(_e, mode) => update({ mode: mode as EngineDatabaseKind })} aria-label="Database" sx={databaseChoiceSx}>
      <Box sx={storageOptionSx}>
        <FormControlLabel
          value="managed"
          control={<Radio size="small" />}
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {ENGINE_DATABASE_LABEL.managed}
              </Typography>
              {managedHint && (
                <Typography variant="caption" sx={mutedSx}>
                  {managedHint}
                </Typography>
              )}
            </Box>
          }
        />
      </Box>
      <Box sx={storageOptionSx}>
        <FormControlLabel
          value="external"
          control={<Radio size="small" />}
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                My own PostgreSQL
              </Typography>
              <Typography variant="caption" sx={mutedSx}>
                The database needs the pgvector extension, and the user needs permission to create schemas and tables in it. The engine keeps all its data there. Deleting the engine does not delete the database or its data.
              </Typography>
            </Box>
          }
        />
        {value.mode === 'external' && (
          <Stack sx={{ ...storageOptionBodySx, ...fieldStackSx }}>
            <Box sx={databaseHostRowSx}>
              {text('host', 'Host', 'db.example.com')}
              {text('port', 'Port')}
            </Box>
            {text('database', 'Database')}
            {text('username', 'Username')}
            <SecretField label="Password" required value={value.password} error={shown('password')} onChange={(password) => update({ password })} onBlur={() => leave('password')} />
            <TextField select labelPlacement="top" label="TLS mode" fullWidth size="small" value={value.sslMode} helperText={sslHint} onChange={(e) => update({ sslMode: e.target.value as DatabaseSslMode })}>
              {DATABASE_SSL_MODES.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            {needsCaCertificate(value) && (
              <TextField
                labelPlacement="top"
                label="CA certificate"
                required
                fullWidth
                multiline
                minRows={4}
                size="small"
                value={value.caCertificate}
                placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'}
                error={!!shown('caCertificate')}
                helperText={shown('caCertificate') ?? 'PEM of the CA that signed the server certificate.'}
                onChange={(e) => update({ caCertificate: e.target.value })}
                onBlur={() => leave('caCertificate')}
                sx={{ ...REQUIRED_FIELD_SX, ...pemFieldSx }}
              />
            )}
            <Stack direction="row" alignItems="center" gap={1.5}>
              <Button variant="outlined" disabled={Object.keys(errors).length > 0 || check.isPending} startIcon={check.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={() => check.mutate(toExternalDatabase(value))}>
                {check.isPending ? 'Testing…' : 'Test connection'}
              </Button>
              {Object.keys(errors).length > 0 && (
                <Typography variant="caption" sx={mutedSx}>
                  Fill in every field to test the connection.
                </Typography>
              )}
            </Stack>
            {check.isSuccess && (
              <Alert severity="success" variant="outlined">
                Connected. PostgreSQL {check.data.serverVersion} with pgvector {check.data.pgvectorVersion}.
              </Alert>
            )}
            {check.isError && (
              <Alert severity="error" variant="outlined">
                {engineMessage(check.error, "Couldn't connect to the database.")}
              </Alert>
            )}
          </Stack>
        )}
      </Box>
      <Typography variant="caption" sx={mutedSx}>
        Neo4j and other databases are coming soon.
      </Typography>
    </RadioGroup>
  );
}
