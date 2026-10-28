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

import { Alert, Box, Button, IconButton, Link, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../common/TextField';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { Dispatch, JSX, SetStateAction } from 'react';
import { Link as RouterLink } from 'react-router';
import { navUrl, useScope } from '../../nav';
import { generateUUID } from '../../utils/string';

export interface MiConfigRow {
  id: string;
  key: string;
  value: string;
  /** A secret that is already stored: its value is write-only, blank means unchanged. */
  stored?: boolean;
}

type SetRows = Dispatch<SetStateAction<MiConfigRow[]>>;

interface MiConfigEditorProps {
  envVars: MiConfigRow[];
  secrets: MiConfigRow[];
  onEnvVarsChange: SetRows;
  onSecretsChange: SetRows;
  /** The error to show under a row's key; rows are addressed as `env:<i>` / `secret:<i>`. */
  errorFor: (id: string, key: string) => string;
  /** Show the "fix the highlighted keys" summary under the sections. */
  showErrorSummary: boolean;
}

/**
 * The environment variables and secrets of one MI environment, as editable rows.
 * Used by MiConfigureDrawer and, on a first promotion, MiPromoteDrawer.
 */
export default function MiConfigEditor({ envVars, secrets, onEnvVarsChange, onSecretsChange, errorFor, showErrorSummary }: MiConfigEditorProps): JSX.Element {
  const scope = useScope();
  const configsUrl = navUrl(scope, 'configs-secrets');

  const updateRow = (setRows: SetRows, id: string, patch: Partial<MiConfigRow>) => setRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (setRows: SetRows, id: string) => setRows((rows) => rows.filter((r) => r.id !== id));
  const addRow = (setRows: SetRows) => setRows((rows) => [...rows, { id: generateUUID(), key: '', value: '' }]);

  const renderRows = (rows: MiConfigRow[], setRows: SetRows, kind: 'env' | 'secret') =>
    rows.map((r, i) => {
      const keyErr = errorFor(`${kind}:${i}`, r.key);
      return (
        <Stack key={r.id} direction="row" gap={1} alignItems="flex-start">
          <TextField size="small" placeholder="Key" value={r.key} disabled={r.stored} autoComplete="off" onChange={(e) => updateRow(setRows, r.id, { key: e.target.value })} error={!!keyErr} helperText={keyErr || ' '} sx={{ flex: 1 }} />
          <TextField
            size="small"
            placeholder={r.stored ? 'Unchanged' : 'Value'}
            type={kind === 'secret' ? 'password' : 'text'}
            // A key field followed by a password field looks like a login form: without this,
            // a password manager fills in the user's own password and Save stores it as the secret.
            autoComplete={kind === 'secret' ? 'new-password' : 'off'}
            value={r.value}
            onChange={(e) => updateRow(setRows, r.id, { value: e.target.value })}
            helperText={r.stored ? 'Enter a value to replace the secret' : ' '}
            sx={{ flex: 1 }}
          />
          <IconButton size="small" color="error" aria-label={`Remove ${r.key || 'row'}`} onClick={() => removeRow(setRows, r.id)} sx={{ mt: 0.5 }}>
            <Trash2 size={16} />
          </IconButton>
        </Stack>
      );
    });

  const renderSection = (title: string, description: string, rows: MiConfigRow[], setRows: SetRows, kind: 'env' | 'secret', addLabel: string) => (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {description}
      </Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          None added.
        </Typography>
      ) : (
        renderRows(rows, setRows, kind)
      )}
      <Button size="small" startIcon={<Plus size={14} />} onClick={() => addRow(setRows)}>
        {addLabel}
      </Button>
    </Box>
  );

  return (
    <>
      <Alert severity="info" sx={{ mb: 3 }}>
        The integration reads these as <code>{'${configs.<key>}'}</code>. To mount files, go to{' '}
        {configsUrl ? (
          <Link component={RouterLink} to={configsUrl}>
            Configs &amp; Secrets
          </Link>
        ) : (
          'Configs & Secrets'
        )}
        .
      </Alert>
      {renderSection('Environment Variables', 'Plain values, visible to anyone who can configure the integration.', envVars, onEnvVarsChange, 'env', 'Add Environment Variable')}
      {renderSection('Secrets', 'Stored encrypted. Values cannot be viewed after saving.', secrets, onSecretsChange, 'secret', 'Add Secret')}
      {showErrorSummary && <Alert severity="error">Fix the highlighted keys before saving.</Alert>}
    </>
  );
}

/** Stands in for MiConfigEditor while the configuration loads. */
export function MiConfigEditorSkeleton(): JSX.Element {
  return (
    <Stack gap={1.5}>
      {[0, 1, 2].map((i) => (
        <Stack key={i} direction="row" gap={1}>
          <Skeleton variant="rounded" height={40} sx={{ flex: 1 }} />
          <Skeleton variant="rounded" height={40} sx={{ flex: 1 }} />
        </Stack>
      ))}
    </Stack>
  );
}
