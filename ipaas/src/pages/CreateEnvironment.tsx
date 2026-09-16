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

import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, PageContent, Select, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useDataPlanes } from '../hooks/useDataPlanes';
import { useAddEnvironment } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { IS_CLOUD } from '../features';
import BusyFields from '../components/common/BusyFields';
import { buildEnvironmentVhost, EnvironmentValidationError } from '../utils/environment';
import { resourceUrl, type OrgScope } from '../nav';

export default function CreateEnvironment(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const orgUuid = useOrgUuid();
  const listUrl = resourceUrl(scope, 'environments');
  const { data: dataPlanes = [], isLoading: loadingDataPlanes, isError: dataPlanesError, refetch: refetchDataPlanes } = useDataPlanes();
  const create = useAddEnvironment();

  const [name, setName] = useState('My-New-Environment');
  const [description, setDescription] = useState('');
  const [dnsPrefix, setDnsPrefix] = useState('my-env');
  const [dataplaneId, setDataplaneId] = useState('');
  const [critical, setCritical] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the data plane to the first available once the list loads.
  useEffect(() => {
    if (dataPlanes.length) setDataplaneId((prev) => (prev && dataPlanes.some((d) => d.id === prev) ? prev : dataPlanes[0].id));
  }, [dataPlanes]);

  // OpenChoreo derives no per-environment hostname — the gateway host is fixed at
  // deploy time — so cloud collects a description instead of a DNS prefix.
  const selectedDataPlane = useMemo(() => dataPlanes.find((d) => d.id === dataplaneId), [dataPlanes, dataplaneId]);
  const vhostPreview = !IS_CLOUD && orgUuid && dnsPrefix.trim() ? buildEnvironmentVhost(orgUuid, dnsPrefix.trim(), selectedDataPlane?.externalGatewayVirtualHost) : '';

  const submit = () => {
    setError(null);
    if (!orgUuid) {
      setError("Couldn't determine your organization. Please reload and try again.");
      return;
    }
    create.mutate(
      {
        orgUuid,
        name: name.trim(),
        dataplaneId,
        dnsPrefix: dnsPrefix.trim(),
        isProd: critical,
        vhost: IS_CLOUD ? '' : buildEnvironmentVhost(orgUuid, dnsPrefix.trim(), selectedDataPlane?.externalGatewayVirtualHost),
        ...(IS_CLOUD ? { description: description.trim() } : {}),
      },
      {
        onSuccess: () => navigate(listUrl, { state: { success: true, environmentName: name.trim() } }),
        onError: (err) => {
          if (err instanceof EnvironmentValidationError) {
            setError(err.field === 'name' ? 'An environment with this name already exists. Please choose a different name.' : 'The derived hostname is already in use. Try a different DNS prefix.');
          } else {
            setError('Failed to create the environment. Please try again.');
          }
        },
      },
    );
  };

  // `isSuccess` keeps the control disabled through the deferred navigation:
  // the mutation settles before the route changes, which would otherwise re-enable
  // submit and allow a duplicate.
  const canSubmit = !!name.trim() && (IS_CLOUD || !!dnsPrefix.trim()) && !!dataplaneId && !create.isPending && !create.isSuccess;

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(listUrl)} sx={{ mb: 2 }}>
        Back to Environments
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Create Environment
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3, maxWidth: 600 }}>
          {error}
        </Alert>
      )}

      <BusyFields busy={create.isPending}>
        <Stack gap={3} sx={{ maxWidth: 600, mb: 4 }}>
          <TextField label="Name" required placeholder="e.g., staging" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.75 }}>
              Data Plane
            </Typography>
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
            ) : (
              <Select fullWidth size="small" displayEmpty value={dataplaneId} onChange={(e) => setDataplaneId(String(e.target.value))}>
                <MenuItem value="" disabled>
                  Select a data plane
                </MenuItem>
                {dataPlanes.map((dp) => (
                  <MenuItem key={dp.id} value={dp.id}>
                    {dp.name}
                  </MenuItem>
                ))}
              </Select>
            )}
          </Box>
          {IS_CLOUD ? (
            <TextField label="Description" placeholder="What this environment is for" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
          ) : (
            <Box>
              <TextField label="DNS Prefix" required placeholder="e.g., staging" value={dnsPrefix} onChange={(e) => setDnsPrefix(e.target.value)} fullWidth />
              {vhostPreview && (
                <Alert severity="info" sx={{ mt: 1.5 }}>
                  DNS for the environment will be created as {vhostPreview}. URL customization will be enabled for the new environment after provisioning, which can take about 5 minutes.
                </Alert>
              )}
            </Box>
          )}
          {/* Hidden on cloud: marking an environment critical does not take effect. */}
          {!IS_CLOUD && <FormControlLabel control={<Checkbox checked={critical} onChange={(_, v) => setCritical(v)} />} label="Mark as Critical Environment" />}
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
