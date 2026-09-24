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

import { Alert, Box, Button, CircularProgress, FormControlLabel, Link, MenuItem, Radio, RadioGroup, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { CircleAlert, Database, ExternalLink, Plus, RefreshCw, Waypoints } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';
import { useServerDatabases } from '../../../hooks/usePlatformServices';
import { STORAGE_DEFAULT_DATABASE, type StorageBackendInfo } from '../../../constants/contextEngine';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import { isGraphUri } from '../../../utils/contextEngine';
import SecretField from '../../RagIngestion/SecretField';
import { sourceTileMarkSx, storageCardSx, storageEmptySx, storageLinksSx, storageOptionBodySx, storageOptionSx, storageRadioGroupSx } from '../styles';
import type { ExternalStorage, InfrastructureStorage, StorageSelection } from '../../../types/contextEngine';
import type { DatabaseServer } from '../../../types/platformServices';

interface StorageBackendCardProps {
  info: StorageBackendInfo;
  value: StorageSelection;
  onChange: (value: StorageSelection) => void;
  /** Infrastructure servers that can back this store (already filtered for the kind). */
  servers: DatabaseServer[];
  serversLoading: boolean;
  serversError: boolean;
  onRefresh: () => void;
  /** Managed databases are switched off for this deployment; the Infrastructure option is then disabled. */
  infrastructureAvailable: boolean;
  /** Infrastructure list and create pages for this store, when Infrastructure offers it. */
  listUrl?: string;
  createUrl?: string;
}

const KIND_ICON: Record<StorageBackendInfo['kind'], ReactNode> = { vector: <Waypoints size={20} />, relational: <Database size={20} />, graph: <Waypoints size={20} /> };

const serverSubtitle = (s: DatabaseServer): string =>
  [s.type === 'postgres' ? 'PostgreSQL' : s.type, s.is_vector_enabled ? 'pgvector' : null, `${s.cloud_provider.toUpperCase()} ${s.cloud_region.toUpperCase()}`, s.status === 'ACTIVE' ? 'Active' : s.status.toLowerCase()].filter(Boolean).join(' · ');

/** Database picker for an Infrastructure server: the server's databases when it lists any, else a free-text name. */
function DatabaseField({ kind, value, onChange }: { kind: StorageBackendInfo['kind']; value: InfrastructureStorage; onChange: (v: InfrastructureStorage) => void }): JSX.Element {
  const dbs = useServerDatabases(value.serverId);
  const names = (dbs.data ?? []).map((d) => d.name);
  if (names.length > 0) {
    return (
      <TextField
        select
        label="Database"
        required
        fullWidth
        size="small"
        value={names.includes(value.database) ? value.database : ''}
        onChange={(e) => onChange({ ...value, database: e.target.value })}
        helperText="Existing databases on this server. Create another one in Infrastructure."
        sx={REQUIRED_FIELD_SX}>
        {names.map((n) => (
          <MenuItem key={n} value={n}>
            {n}
          </MenuItem>
        ))}
      </TextField>
    );
  }
  return (
    <TextField
      label="Database"
      required
      fullWidth
      size="small"
      value={value.database}
      placeholder={STORAGE_DEFAULT_DATABASE[kind]}
      onChange={(e) => onChange({ ...value, database: e.target.value })}
      helperText={dbs.isLoading ? 'Looking up databases on this server…' : 'Created on the server if it does not exist.'}
      sx={REQUIRED_FIELD_SX}
    />
  );
}

/** One store's card: Engine managed, or an Infrastructure server (or an external database when Infrastructure has none). */
export default function StorageBackendCard({ info, value, onChange, servers, serversLoading, serversError, onRefresh, infrastructureAvailable, listUrl, createUrl }: StorageBackendCardProps): JSX.Element {
  const alternativeMode = info.infraSegment ? 'infrastructure' : 'external';
  const chooseMode = (mode: string) => {
    if (mode === 'managed') onChange({ mode: 'managed' });
    else if (alternativeMode === 'infrastructure') onChange({ mode: 'infrastructure', serverId: '', serverName: '', database: STORAGE_DEFAULT_DATABASE[info.kind] });
    else onChange({ mode: 'external', uri: '', database: STORAGE_DEFAULT_DATABASE[info.kind], user: '', password: '' });
  };
  const pickServer = (id: string) => {
    if (value.mode !== 'infrastructure') return;
    const s = servers.find((x) => x.id === id);
    onChange({ ...value, serverId: id, serverName: s?.name ?? '' });
  };
  const external = value.mode === 'external' ? value : null;
  const setExternal = (patch: Partial<ExternalStorage>) => external && onChange({ ...external, ...patch });
  const uriError = external && external.uri && !isGraphUri(external.uri) ? 'Enter a bolt://, neo4j:// or http(s):// URI' : '';

  const infraBody = (): ReactNode => {
    if (!infrastructureAvailable)
      return (
        <Alert severity="info" variant="outlined">
          Managed databases are not enabled for this deployment.
        </Alert>
      );
    if (serversLoading) return <CircularProgress size={20} />;
    if (serversError) {
      return (
        <Alert
          severity="error"
          variant="outlined"
          action={
            <Button color="inherit" size="small" onClick={onRefresh}>
              Retry
            </Button>
          }>
          Couldn't load {info.infraNoun} servers.
        </Alert>
      );
    }
    if (servers.length === 0) {
      return (
        <Box sx={storageEmptySx}>
          <Stack direction="row" gap={1.25} alignItems="flex-start">
            <Box sx={{ color: 'warning.dark', display: 'flex', mt: 0.25 }}>
              <CircleAlert size={18} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                No {info.infraNoun}s in Infrastructure yet
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Create one under Infrastructure. Provisioning takes a few minutes.
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {createUrl && (
              <Button size="small" variant="contained" startIcon={<Plus size={14} />} endIcon={<ExternalLink size={12} />} component="a" href={createUrl} target="_blank" rel="noopener noreferrer">
                Create {info.infraNoun}
              </Button>
            )}
            <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} />} onClick={onRefresh}>
              Refresh
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Your draft is saved — come back to this step when the server is ready, or continue with Engine managed.
          </Typography>
        </Box>
      );
    }
    if (value.mode !== 'infrastructure') return null;
    return (
      <Stack gap={2}>
        <TextField
          select
          label={`${info.title} server`}
          required
          fullWidth
          size="small"
          value={value.serverId}
          onChange={(e) => pickServer(e.target.value)}
          helperText={value.serverId ? serverSubtitle(servers.find((s) => s.id === value.serverId) ?? servers[0]) : `${servers.length} server${servers.length === 1 ? '' : 's'} available`}
          slotProps={{ select: { renderValue: (v) => servers.find((s) => s.id === v)?.name ?? '' } }}
          sx={REQUIRED_FIELD_SX}>
          {servers.map((s) => (
            <MenuItem key={s.id} value={s.id} disabled={s.status !== 'ACTIVE' && s.status !== 'CREATING'}>
              <Box>
                <Typography variant="body2">{s.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {serverSubtitle(s)}
                </Typography>
              </Box>
            </MenuItem>
          ))}
        </TextField>
        {value.serverId && <DatabaseField kind={info.kind} value={value} onChange={onChange} />}
        <Typography variant="caption" color="text.secondary">
          Connection details are resolved from the selected server when you create.
        </Typography>
        <Box sx={storageLinksSx}>
          {listUrl && (
            <Link href={listUrl} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              Open {info.infraSegment === 'vector-databases' ? 'Vector Databases' : 'Databases'} <ExternalLink size={12} />
            </Link>
          )}
          <Link component="button" type="button" variant="body2" onClick={onRefresh} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <RefreshCw size={12} /> Refresh
          </Link>
        </Box>
      </Stack>
    );
  };

  const externalBody = (): ReactNode =>
    external ? (
      <Stack gap={2}>
        <TextField
          label="Connection URI"
          required
          fullWidth
          size="small"
          value={external.uri}
          placeholder="bolt://graph.internal:7687"
          error={!!uriError}
          helperText={uriError || undefined}
          onChange={(e) => setExternal({ uri: e.target.value })}
          sx={REQUIRED_FIELD_SX}
        />
        <TextField label="Database" required fullWidth size="small" value={external.database} onChange={(e) => setExternal({ database: e.target.value })} sx={REQUIRED_FIELD_SX} />
        <TextField label="User" required fullWidth size="small" value={external.user} onChange={(e) => setExternal({ user: e.target.value })} sx={REQUIRED_FIELD_SX} />
        <SecretField label="Password" required value={external.password} onChange={(v) => setExternal({ password: v })} />
      </Stack>
    ) : null;

  return (
    <Box sx={storageCardSx}>
      <Stack direction="row" gap={1.5} alignItems="flex-start">
        <Box sx={sourceTileMarkSx}>{KIND_ICON[info.kind]}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {info.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45 }}>
            {info.purpose}
          </Typography>
        </Box>
      </Stack>

      <RadioGroup value={value.mode} onChange={(_e, mode) => chooseMode(mode)} aria-label={`${info.title} placement`} sx={storageRadioGroupSx}>
        <Box sx={storageOptionSx(value.mode === 'managed')}>
          <FormControlLabel
            value="managed"
            control={<Radio size="small" />}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Engine managed · {info.managedName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {info.managedDescription}
                </Typography>
              </Box>
            }
          />
        </Box>
        <Box sx={storageOptionSx(value.mode !== 'managed')}>
          <FormControlLabel
            value={alternativeMode}
            control={<Radio size="small" />}
            disabled={alternativeMode === 'infrastructure' && !infrastructureAvailable}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {info.alternativeLabel}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {info.alternativeDescription}
                </Typography>
              </Box>
            }
          />
          {value.mode !== 'managed' && <Box sx={storageOptionBodySx}>{alternativeMode === 'infrastructure' ? infraBody() : externalBody()}</Box>}
        </Box>
      </RadioGroup>
      {!info.infraSegment && (
        <Typography variant="caption" color="text.secondary">
          Graph databases are not offered under Infrastructure yet.
        </Typography>
      )}
    </Box>
  );
}
