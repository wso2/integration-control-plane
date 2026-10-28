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

import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, FormHelperText, MenuItem, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../components/common/TextField';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useDataPlanes } from '../hooks/useDataPlanes';
import { useAddEnvironment } from '../hooks/useEnvironments';
import { isQuotaError } from '../utils/apiErrors';
import { useOrgUuid } from '../hooks/useOrgUuid';
import BusyFields from '../components/common/BusyFields';
import { resourceUrl, type OrgScope } from '../nav';
import { CRITICAL_ENVIRONMENT_HELP, CRITICAL_ENVIRONMENT_LABEL } from '../constants/environment';

export default function CreateEnvironment(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const orgUuid = useOrgUuid();
  const listUrl = resourceUrl(scope, 'environments');
  const { data: dataPlanes = [], isLoading: loadingDataPlanes, isError: dataPlanesError, refetch: refetchDataPlanes } = useDataPlanes();
  const create = useAddEnvironment();

  const [name, setName] = useState('My-New-Environment');
  const [description, setDescription] = useState('');
  const [dataplaneId, setDataplaneId] = useState('');
  const [critical, setCritical] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorSeverity, setErrorSeverity] = useState<'error' | 'warning'>('error');

  // Defaults to the first data plane; the picker appears only when there is more than one to choose from.
  useEffect(() => {
    if (dataPlanes.length) setDataplaneId((prev) => (prev && dataPlanes.some((d) => d.id === prev) ? prev : dataPlanes[0].id));
  }, [dataPlanes]);

  const submit = () => {
    setError(null);
    setErrorSeverity('error');
    if (!orgUuid) {
      setError("Couldn't determine your organization. Please reload and try again.");
      return;
    }
    create.mutate(
      {
        orgUuid,
        name: name.trim(),
        dataplaneId,
        isProd: critical,
        description: description.trim(),
      },
      {
        onSuccess: () => navigate(listUrl, { state: { success: true, environmentName: name.trim() } }),
        onError: (err) => {
          // The BFF's wording names the resource and its limit, so it is shown as sent.
          setErrorSeverity(isQuotaError(err) ? 'warning' : 'error');
          setError(err instanceof Error ? err.message : 'Failed to create the environment. Please try again.');
        },
      },
    );
  };

  // `isSuccess` keeps the control disabled through the deferred navigation:
  // the mutation settles before the route changes, which would otherwise re-enable
  // submit and allow a duplicate.
  // No data plane is required: the BFF falls back to the 'default' plane when none is listed.
  const canSubmit = !!name.trim() && !create.isPending && !create.isSuccess;

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(listUrl)} sx={{ mb: 2 }}>
        Back to Environments
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Create Environment
      </Typography>

      {error && (
        <Alert severity={errorSeverity} onClose={() => setError(null)} sx={{ mb: 3, maxWidth: 600 }}>
          {error}
        </Alert>
      )}

      <BusyFields busy={create.isPending}>
        <Stack gap={3} sx={{ maxWidth: 600, mb: 4 }}>
          <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          {loadingDataPlanes ? (
            <CircularProgress size={20} />
          ) : dataPlanesError ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => refetchDataPlanes()}>
                  Retry
                </Button>
              }>
              Failed to load data planes.
            </Alert>
          ) : dataPlanes.length > 1 ? (
            <TextField select label="Data Plane" required value={dataplaneId} onChange={(e) => setDataplaneId(e.target.value)} fullWidth>
              {dataPlanes.map((dp) => (
                <MenuItem key={dp.id} value={dp.id}>
                  {dp.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
          <Box>
            <FormControlLabel control={<Checkbox checked={critical} onChange={(_, v) => setCritical(v)} />} label={CRITICAL_ENVIRONMENT_LABEL} />
            <FormHelperText sx={{ mt: 0 }}>{CRITICAL_ENVIRONMENT_HELP}</FormHelperText>
          </Box>
        </Stack>
      </BusyFields>

      <Stack direction="row" gap={2}>
        <Button variant="outlined" onClick={() => navigate(listUrl)} disabled={create.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          Create
        </Button>
      </Stack>
    </PageContent>
  );
}
