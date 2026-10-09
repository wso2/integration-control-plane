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

import { Alert, Box, Button, Card, CircularProgress, IconButton, PageContent, Stack, Tab, Tabs, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, BookOpen, Check, Copy, ExternalLink, Eye, EyeOff, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { isConnectionsEnabled, useConnection, useRefreshConnection } from '../hooks/useConnections';
import { useProjectId } from '../../hooks/useProjects';
import { useEnvironments } from '../../hooks/useEnvironments';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { Permissions } from '../../constants/permissions';
import { componentConnectionsBase, projectConnectionsBase } from '../utils/connections';
import HowToUseDrawer from '../components/Connections/HowToUseDrawer';
import ComingSoon from '../../pages/ComingSoon';
import type { Connection, ConfigKeyEntry } from '../../types/connections';
import { hasComponent, type ComponentScope, type ProjectScope } from '../../nav';

function CopyButton({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip title={copied ? 'Copied' : 'Copy'}>
      <IconButton
        size="small"
        aria-label="Copy value"
        onClick={async () => {
          try {
            await navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // clipboard unavailable or denied — leave the button in its default state
          }
        }}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </IconButton>
    </Tooltip>
  );
}

function FieldRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={{ xs: 0.5, sm: 2 }} sx={{ mb: 1.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" gap={0.5} sx={{ flex: 1, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 0.75, bgcolor: 'action.hover' }}>
        <Typography variant="body2" noWrap sx={{ flex: 1, fontFamily: 'monospace' }} title={value}>
          {value}
        </Typography>
        <CopyButton value={value} />
      </Stack>
    </Stack>
  );
}

function ConfigRow({ entry }: { entry: ConfigKeyEntry }): JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const hidden = entry.isSensitive && !revealed;
  const shown = hidden ? '••••••••••••••••' : entry.value || '—';
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 2, py: 1.25 }}>
      <Typography variant="body2" sx={{ width: 220, flexShrink: 0, fontWeight: 500 }}>
        {entry.key}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={hidden ? undefined : entry.value}>
        {shown}
      </Typography>
      {entry.isSensitive && (
        <IconButton size="small" aria-label={revealed ? 'Hide value' : 'Show value'} onClick={() => setRevealed((r) => !r)}>
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </IconButton>
      )}
      {!!entry.value && (!entry.isSensitive || revealed) && <CopyButton value={entry.value} />}
    </Stack>
  );
}

function findEntry(config: Connection['configurations'][string] | undefined, re: RegExp): ConfigKeyEntry | undefined {
  if (!config) return undefined;
  return Object.values(config.entries).find((e) => re.test(e.key.replace(/[\s_-]/g, '')));
}

export default function ConnectionDetail(scope: ProjectScope | ComponentScope): JSX.Element {
  const { org, project } = scope;
  const navigate = useAppNavigate();
  const { connectionId = '' } = useParams();
  const { projectId } = useProjectId(project);
  const orgUuid = useOrgUuid() ?? '';
  const { hasPermission } = useAccessControl();
  const canManage = hasPermission(Permissions.PROJECT_MANAGE, projectId);
  const { data: connection, isLoading, isError, refetch } = useConnection(connectionId);
  const { data: environments = [] } = useEnvironments(orgUuid, projectId);
  const refresh = useRefreshConnection();

  const [envTab, setEnvTab] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const base = hasComponent(scope) ? componentConnectionsBase(org, project, scope.component) : projectConnectionsBase(org, project);
  const envName = (templateId: string) => environments.find((e) => (e.templateId ?? e.id) === templateId)?.name ?? templateId;

  const envIds = useMemo(() => Object.keys(connection?.configurations ?? {}), [connection]);

  if (!isConnectionsEnabled()) {
    return <ComingSoon title="Coming Soon" description="Connection details are currently under development." />;
  }

  const doRefresh = () => {
    setAlert(null);
    refresh.mutate(connectionId, {
      onSuccess: () => setAlert({ type: 'success', message: 'Connection configuration regenerated.' }),
      onError: (e) => setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Failed to regenerate configuration.' }),
    });
  };

  const activeEnvId = envIds[Math.min(envTab, Math.max(envIds.length - 1, 0))];
  const activeConfig = activeEnvId ? connection?.configurations?.[activeEnvId] : undefined;
  const serviceUrl = findEntry(activeConfig, /serviceurl/i)?.value;
  const appGatewayPath = findEntry(activeConfig, /appgateway|gatewaypath|apppath/i)?.value;

  return (
    <PageContent>
      <Button variant="text" startIcon={<ArrowLeft size={18} />} onClick={() => navigate(base)} sx={{ mb: 2 }}>
        Back to Connection Listing
      </Button>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : isError || !connection ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load connection.
        </Alert>
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} sx={{ mb: 3 }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {connection.name}
            </Typography>
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0 }}>
              {canManage && (
                <Tooltip title={refresh.isPending ? 'Refreshing…' : 'Refresh'}>
                  <span>
                    <IconButton size="small" aria-label="Refresh connection" onClick={doRefresh} disabled={refresh.isPending}>
                      {refresh.isPending ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              <Button variant="outlined" size="small" startIcon={<BookOpen size={16} />} onClick={() => setShowGuide(true)}>
                Developer Guide
              </Button>
            </Stack>
          </Stack>

          <Card variant="outlined" sx={{ p: 2.5, mb: 3, bgcolor: 'action.hover' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={{ xs: 0.25, sm: 2 }} sx={{ mb: 1.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>
                Connecting to
              </Typography>
              <Stack direction="row" alignItems="center" gap={0.5}>
                <Typography variant="body2" color="primary.main">
                  {connection.serviceName || connection.serviceId}
                </Typography>
                <ExternalLink size={13} />
              </Stack>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={{ xs: 0.25, sm: 2 }} sx={{ mb: serviceUrl || appGatewayPath ? 1.5 : 0 }}>
              <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>
                Connection Schema
              </Typography>
              <Typography variant="body2">{connection.schemaName || '—'}</Typography>
            </Stack>

            {serviceUrl && <FieldRow label="Service URL" value={serviceUrl} />}
            {appGatewayPath && <FieldRow label="App Gateway Path" value={appGatewayPath} />}
          </Card>

          {envIds.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Tabs value={Math.min(envTab, envIds.length - 1)} onChange={(_e, v) => setEnvTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                {envIds.map((id) => (
                  <Tab key={id} label={envName(id)} sx={{ minHeight: 40, textTransform: 'none' }} />
                ))}
              </Tabs>

              {activeConfig && Object.values(activeConfig.entries).length > 0 ? (
                <>
                  <Stack direction="row" gap={1} sx={{ px: 2, mb: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ width: 220, flexShrink: 0, fontWeight: 600, letterSpacing: 0.4 }}>
                      CONFIGURATION KEY
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.4 }}>
                      CONFIGURATION VALUE
                    </Typography>
                  </Stack>
                  <Stack gap={1}>
                    {Object.values(activeConfig.entries).map((entry) => (
                      <ConfigRow key={entry.key} entry={entry} />
                    ))}
                  </Stack>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No configurable fields for this environment.
                </Typography>
              )}
            </Box>
          )}
        </>
      )}

      {connection && <HowToUseDrawer open={showGuide} onClose={() => setShowGuide(false)} connection={connection} />}
    </PageContent>
  );
}
