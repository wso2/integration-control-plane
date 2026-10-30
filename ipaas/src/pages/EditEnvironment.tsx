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

import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, FormHelperText, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { CRITICAL_ENVIRONMENT_HELP, CRITICAL_ENVIRONMENT_LABEL } from '../constants/environment';
import TextField from '../components/common/TextField';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useAllEnvironments } from '../hooks/useEnvironments';
import type { Environment } from '../types/environment';
import { useUpdateEnvironment } from '../hooks/useEnvironments';
import { resourceUrl } from '../nav';

function EditEnvironmentForm({ env, orgHandler }: { env: Environment; orgHandler: string }): JSX.Element {
  const navigate = useAppNavigate();
  const [name, setName] = useState(env.name);
  const [description, setDescription] = useState(env.description ?? '');
  const [critical, setCritical] = useState(env.critical);
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateEnvironment();
  const backUrl = resourceUrl({ level: 'organizations', org: orgHandler }, 'environments');
  const isDirty = name !== env.name || description !== (env.description ?? '') || critical !== env.critical;

  const save = () => {
    setError(null);
    mutation.mutate(
      { environmentId: env.id, name, description, critical },
      {
        onSuccess: () => navigate(backUrl, { state: { updated: true, name } }),
        onError: (err) => setError(err.message ?? 'Failed to update environment. Please try again.'),
      },
    );
  };

  return (
    <PageContent fullWidth>
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
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
        <Box>
          <FormControlLabel control={<Checkbox checked={critical} onChange={(_, v) => setCritical(v)} />} label={CRITICAL_ENVIRONMENT_LABEL} />
          <FormHelperText sx={{ mt: 0 }}>{CRITICAL_ENVIRONMENT_HELP}</FormHelperText>
        </Box>
      </Stack>

      <Stack direction="row" gap={2}>
        <Button variant="outlined" onClick={() => navigate(backUrl)}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={!name.trim() || !isDirty || mutation.isPending}>
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
      <PageContent fullWidth>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  if (isError)
    return (
      <PageContent fullWidth>
        <Typography>Failed to load environments</Typography>
      </PageContent>
    );
  const env = environments?.find((e) => e.id === envId);
  if (!env)
    return (
      <PageContent fullWidth>
        <Typography>Environment not found</Typography>
      </PageContent>
    );

  return <EditEnvironmentForm env={env} orgHandler={orgHandler} />;
}
