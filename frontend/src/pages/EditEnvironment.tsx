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

import { Alert, Button, Checkbox, CircularProgress, FormControlLabel, PageContent, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAllEnvironments, type GqlEnvironment } from '../api/queries';
import { useUpdateEnvironment } from '../api/mutations';
import { resourceUrl } from '../nav';

function EditEnvironmentForm({ env, orgHandler }: { env: GqlEnvironment; orgHandler: string }): JSX.Element {
  const navigate = useNavigate();
  const [name, setName] = useState(env.name);
  const [description, setDescription] = useState(env.description ?? '');
  const [critical, setCritical] = useState(env.critical);
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateEnvironment();
  const backUrl = resourceUrl({ level: 'organizations', org: orgHandler }, 'environments');

  // Normalize string fields once for consistent use everywhere
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  const isDirty = trimmedName !== env.name || trimmedDescription !== (env.description ?? '') || critical !== env.critical;

  const save = () => {
    setError(null);
    mutation.mutate(
      { environmentId: env.id, name: trimmedName, description: trimmedDescription, critical },
      {
        onSuccess: () => navigate(backUrl, { state: { updated: true, name: trimmedName } }),
        onError: (err) => setError(err.message ?? 'Failed to update environment. Please try again.'),
      },
    );
  };

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(backUrl)} sx={{ mb: 2 }}>
        Back to Environments
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Edit Environment
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3, maxWidth: 600 }}>
          {error}
        </Alert>
      )}

      <Stack gap={3} sx={{ maxWidth: 600, mb: 4 }}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
        {/* Runtimes name their environment by handler in their config, so it can't change after creation. */}
        <TextField label="Handler" value={env.handler} fullWidth disabled helperText="Handler cannot be changed" />
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
        <FormControlLabel control={<Checkbox checked={critical} onChange={(_, v) => setCritical(v)} />} label="Mark as Critical Environment" />
      </Stack>

      <Stack direction="row" gap={2}>
        <Button variant="outlined" onClick={() => navigate(backUrl)}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={!trimmedName || !isDirty || mutation.isPending}>
          Save
        </Button>
      </Stack>
    </PageContent>
  );
}

export default function EditEnvironment(): JSX.Element {
  const { orgHandler = 'default', envId = '' } = useParams();
  const { data: environments, isLoading, isError } = useAllEnvironments();

  if (isLoading)
    return (
      <PageContent>
        <CircularProgress sx={{ display: 'block', mx: 'auto', py: 8 }} />
      </PageContent>
    );
  if (isError)
    return (
      <PageContent>
        <Typography>Failed to load environments</Typography>
      </PageContent>
    );
  const env = environments?.find((e) => e.id === envId);
  if (!env)
    return (
      <PageContent>
        <Typography>Environment not found</Typography>
      </PageContent>
    );

  return <EditEnvironmentForm env={env} orgHandler={orgHandler} />;
}
