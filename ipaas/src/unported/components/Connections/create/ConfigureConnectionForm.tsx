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

import { Alert, Avatar, Box, Button, Chip, CircularProgress, Collapse, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { Box as BoxIcon, Building2, ChevronDown, Globe, Pencil } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react';
import { useEnvironments } from '../../../../hooks/useEnvironments';
import { ACCESS_MODE_DESCRIPTION, availableAccessModes, buildChoreoConnectionRequest, buildThirdPartyConnectionRequest, formatVersion, type ConnectionAccessMode, type EnvForConnection } from '../../../utils/connections';
import SelectCard from './SelectCard';
import type { ChoreoConnectionRequest, ConnectionCatalogItem, ConnectionRequest } from '../../../../types/connections';

interface ConfigureConnectionFormProps {
  projectId: string;
  orgUuid: string;
  orgIdInteger: number | undefined;
  submitting: boolean;
  submitError: string | null;
  onCreateChoreo: (request: ChoreoConnectionRequest, generateCreds: boolean) => void;
  onCreateThirdParty: (request: ConnectionRequest) => void;
  onCancel: () => void;
  onDismissError?: () => void;
  preselected: ConnectionCatalogItem;
  component?: { uuid: string; type?: string };
  onChangeService?: () => void;
}

const requiredSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } };

const ACCESS_MODE_ICON: Record<ConnectionAccessMode, ReactNode> = {
  Public: <Globe size={20} />,
  Organization: <Building2 size={20} />,
  Project: <BoxIcon size={20} />,
};

export default function ConfigureConnectionForm({ projectId, orgUuid, orgIdInteger, submitting, submitError, onCreateChoreo, onCreateThirdParty, onCancel, onDismissError, preselected, component, onChangeService }: ConfigureConnectionFormProps): JSX.Element {
  const service = preselected;
  const isThirdParty = !!service.isThirdParty;
  const schemas = service.connectionSchemas ?? [];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schemaReference, setSchemaReference] = useState('');
  const [accessMode, setAccessMode] = useState<ConnectionAccessMode>('Project');
  const [envOpen, setEnvOpen] = useState(false);

  const { data: environments = [], isLoading: envLoading } = useEnvironments(orgUuid, projectId);
  const availableModes = useMemo(() => availableAccessModes(service.visibility), [service.visibility]);

  useEffect(() => {
    const def = schemas.find((s) => s.isDefault) ?? schemas[0];
    setSchemaReference(def?.id ?? '');
    setAccessMode(availableModes[0]);
  }, [service.serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeSchema = schemas.find((s) => s.id === schemaReference);
  const envForConnection = useMemo<EnvForConnection[]>(() => environments.map((e) => ({ id: e.templateId ?? e.id, critical: e.critical })), [environments]);

  const valid = name.trim() !== '' && !!schemaReference && environments.length > 0 && !!orgUuid && (isThirdParty || !!orgIdInteger);

  const submit = () => {
    if (!valid || submitting) return;
    if (isThirdParty) {
      onCreateThirdParty(
        buildThirdPartyConnectionRequest({
          name,
          description,
          serviceId: service.serviceId,
          schemaReference,
          accessMode,
          organizationUuid: orgUuid,
          projectUuid: projectId,
          environments: envForConnection,
          entries: activeSchema?.entries ?? [],
          component,
        }),
      );
    } else {
      if (!orgIdInteger) return;
      onCreateChoreo(
        buildChoreoConnectionRequest({
          name,
          description,
          serviceId: service.serviceId,
          schemaReference,
          accessMode,
          organizationUuid: orgUuid,
          projectUuid: projectId,
          orgIdInteger,
          environments: envForConnection,
          component,
        }),
        true,
      );
    }
  };

  return (
    <Box sx={{ maxWidth: 760 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        Create a Connection
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Connecting to
      </Typography>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 3, width: '50%' }}>
        <Stack direction="row" gap={1.5} alignItems="flex-start">
          <Avatar sx={{ width: 40, height: 40, fontSize: '1.05rem', fontWeight: 700, flexShrink: 0, bgcolor: 'grey.300', color: 'text.primary' }}>{(service.name[0] ?? '?').toUpperCase()}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={0.75}>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {service.name}
              </Typography>
              {onChangeService && (
                <Box component="button" onClick={onChangeService} aria-label="Change service" sx={{ border: 0, bgcolor: 'transparent', p: 0.25, cursor: 'pointer', color: 'primary.main', display: 'inline-flex' }}>
                  <Pencil size={14} />
                </Box>
              )}
            </Stack>
            {service.serviceType && (
              <Typography variant="caption" color="primary.main">
                {service.serviceType}
              </Typography>
            )}
            {service.version && (
              <Box sx={{ mt: 0.5 }}>
                <Chip label={`Version ${formatVersion(service.version)}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', color: 'primary.main', borderColor: 'primary.main', borderRadius: 1 }} />
              </Box>
            )}
          </Box>
        </Stack>
      </Box>

      <Typography variant="body2" sx={{ mb: 0.5 }}>
        Name{' '}
        <Box component="span" sx={{ color: 'error.main' }}>
          *
        </Box>
      </Typography>
      <TextField required fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter Connection Name" sx={{ ...requiredSx, mb: 3 }} />

      <Typography variant="body2" sx={{ mb: 0.5 }}>
        Description{' '}
        <Typography component="span" variant="caption" color="text.secondary">
          (Optional)
        </Typography>
      </Typography>
      <TextField fullWidth multiline minRows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Enter Description" sx={{ mb: 3 }} />

      <Typography variant="body2" sx={{ mb: 1 }}>
        Access Mode{' '}
        <Box component="span" sx={{ color: 'error.main' }}>
          *
        </Box>
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mb: 3 }}>
        {availableModes.map((m) => (
          <SelectCard key={m} selected={accessMode === m} title={m} description={ACCESS_MODE_DESCRIPTION[m]} icon={ACCESS_MODE_ICON[m]} onClick={() => setAccessMode(m)} />
        ))}
      </Stack>

      {schemas.length > 0 && (
        <>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Authentication Scheme{' '}
            <Box component="span" sx={{ color: 'error.main' }}>
              *
            </Box>
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mb: 3 }}>
            {schemas.map((s) => (
              <SelectCard key={s.id} selected={schemaReference === s.id} title={s.name} description={s.description} onClick={() => setSchemaReference(s.id)} />
            ))}
          </Stack>
        </>
      )}

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 3 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          role="button"
          tabIndex={0}
          onClick={() => setEnvOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEnvOpen((o) => !o);
            }
          }}
          sx={{ p: 2, cursor: 'pointer' }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Choreo Environment Mapping - Advanced
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Map your current project&apos;s environments to corresponding environments of the connecting service&apos;s project.
            </Typography>
          </Box>
          <Box sx={{ color: 'text.secondary', transform: envOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <ChevronDown size={18} />
          </Box>
        </Stack>
        <Collapse in={envOpen}>
          <Box sx={{ px: 2, pb: 2 }}>
            {envLoading ? (
              <CircularProgress size={18} />
            ) : environments.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                No environments found for this project.
              </Typography>
            ) : (
              <Stack gap={1}>
                {environments.map((e) => (
                  <Stack key={e.id} direction="row" justifyContent="space-between">
                    <Typography variant="body2">{e.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {e.name}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        </Collapse>
      </Box>

      {environments.length === 0 && !envLoading && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          No environments found for this project — a connection needs at least one target environment.
        </Alert>
      )}

      {submitError && (
        <Alert severity="error" onClose={onDismissError} sx={{ mb: 2 }}>
          {submitError}
        </Alert>
      )}

      <Stack direction="row" gap={1.5}>
        <Button variant="outlined" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!valid || submitting} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      </Stack>
    </Box>
  );
}
