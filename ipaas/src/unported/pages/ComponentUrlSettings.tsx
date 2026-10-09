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

import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, ListingTable, MenuItem, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { Globe, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import Authorized from '../../components/Authorized';
import EmptyListing from '../../components/EmptyListing';
import ComponentSettingsTabs from '../components/Settings/ComponentSettingsTabs';
import { Permissions } from '../../constants/permissions';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useComponentUrlMappings, useCreateUrlMapping, useCustomDomains, useDeleteUrlMapping } from '../hooks/useCustomDomains';
import { urlSettingsEnabled } from '../../constants/componentSettingsSections';
import { useProjectId } from '../../hooks/useProjects';
import { getStatusColor } from '../../config/statusColors';
import type { CustomDomain, CustomUrlMapping } from '../../types/customDomain';
import type { ComponentScope } from '../../nav';

function ConfigureDialog({ componentId, domains, onClose, onDone }: { componentId: string; domains: CustomDomain[]; onClose: () => void; onDone: (msg: string) => void }): JSX.Element {
  const create = useCreateUrlMapping(componentId);
  const [domainId, setDomainId] = useState('');
  const [defaultUrl, setDefaultUrl] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [error, setError] = useState('');

  const selectedDomain = domains.find((d) => d.id === domainId);
  const preview = selectedDomain ? `https://${selectedDomain.name}/${customPath.replace(/^\//, '')}` : '';

  const valid = !!domainId && !!defaultUrl.trim();
  const handleCreate = () => {
    setError('');
    let defaultDomain = '';
    let defaultPath = '/';
    try {
      const u = new URL(defaultUrl.trim());
      defaultDomain = u.hostname;
      defaultPath = u.pathname || '/';
    } catch {
      setError('Enter a valid default URL (e.g. https://host/path).');
      return;
    }
    create.mutate(
      { domainId, defaultPath, customPath: `/${customPath.replace(/^\//, '')}`, componentId, defaultDomain },
      { onSuccess: () => onDone('Custom URL mapping created.'), onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create the mapping.') },
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure Custom URL</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack gap={2} sx={{ mt: 1 }}>
          <TextField label="Default URL" value={defaultUrl} onChange={(e) => setDefaultUrl(e.target.value)} fullWidth required placeholder="https://default-host/path" helperText="The endpoint URL to map a custom domain onto." />
          <TextField select label="Custom Domain" value={domainId} onChange={(e) => setDomainId(e.target.value)} fullWidth required>
            {domains.length === 0 ? (
              <MenuItem value="" disabled>
                No custom domains configured
              </MenuItem>
            ) : (
              domains.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))
            )}
          </TextField>
          <TextField label="Path" value={customPath} onChange={(e) => setCustomPath(e.target.value)} fullWidth slotProps={{ input: { startAdornment: <InputAdornment position="start">/</InputAdornment> } }} />
          {preview && <TextField label="Custom URL" value={preview} fullWidth slotProps={{ input: { readOnly: true } }} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleCreate} disabled={!valid || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : <Plus size={16} />}>
          {create.isPending ? 'Configuring…' : 'Configure'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function UrlSettingsBody({ componentId }: { componentId: string }): JSX.Element {
  const { data: mappings = [], isLoading } = useComponentUrlMappings(componentId);
  const { data: domains = [] } = useCustomDomains('api');
  const del = useDeleteUrlMapping(componentId);
  const [configuring, setConfiguring] = useState(false);
  const [deleting, setDeleting] = useState<CustomUrlMapping | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const domainName = useMemo(() => new Map(domains.map((d) => [d.id, d.name])), [domains]);

  const handleDelete = () => {
    if (!deleting?.id) return;
    del.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        setAlert({ type: 'success', message: 'Mapping deleted.' });
      },
      onError: (e) => {
        setDeleting(null);
        setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Delete failed.' });
      },
    });
  };

  if (isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
        <CircularProgress />
      </Box>
    );

  return (
    <>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setConfiguring(true)}>
            Configure Custom URL
          </Button>
        </Authorized>
      </Stack>

      {mappings.length === 0 ? (
        <EmptyListing icon={<Globe size={48} />} title="No custom URLs" description="Map a custom domain onto this integration's endpoints." />
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Custom URL</ListingTable.Cell>
                <ListingTable.Cell>Default URL</ListingTable.Cell>
                <ListingTable.Cell>Status</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {mappings.map((m) => (
                <ListingTable.Row key={m.id ?? `${m.domainId}${m.customPath}`}>
                  <ListingTable.Cell>{`https://${domainName.get(m.domainId) ?? m.defaultDomain}${m.customPath}`}</ListingTable.Cell>
                  <ListingTable.Cell>{`https://${m.defaultDomain}${m.defaultPath}`}</ListingTable.Cell>
                  <ListingTable.Cell>
                    <Chip label={m.status ?? 'Not Requested'} size="small" variant="outlined" color={getStatusColor(m.status ?? '')} />
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                      <Tooltip title="Delete mapping">
                        <IconButton size="small" color="error" aria-label="Delete mapping" onClick={() => setDeleting(m)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </Authorized>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {configuring && (
        <ConfigureDialog
          componentId={componentId}
          domains={domains}
          onClose={() => setConfiguring(false)}
          onDone={(msg) => {
            setConfiguring(false);
            setAlert({ type: 'success', message: msg });
          }}
        />
      )}

      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete custom URL mapping?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">If you proceed, the endpoint reverts to its default URL and the custom URL stops working.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleDelete} disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}

export default function ComponentUrlSettings({ project, component }: ComponentScope): JSX.Element {
  const { projectId } = useProjectId(project);
  const { data: comp, isLoading } = useComponentByHandler(projectId, component);

  return (
    <PageContent>
      <ComponentSettingsTabs active="url-settings" />
      {!urlSettingsEnabled() ? (
        <Alert severity="info">Custom URL mappings are not enabled for this environment.</Alert>
      ) : isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : !comp ? (
        <Typography>Integration not found</Typography>
      ) : (
        <UrlSettingsBody componentId={comp.id} />
      )}
    </PageContent>
  );
}
