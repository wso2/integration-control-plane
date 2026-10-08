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

import { Accordion, AccordionSummary, AccordionDetails, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import SearchField from './SearchField';
import { ChevronDown, Play, Square, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useArtifactSource, useArtifactParams, useArtifactWsdl, useLocalEntryValue, useDataSourceOverview, useDataServiceOverview, useMessageProcessorOverview, ARTIFACT_TYPE_TO_SOURCE_TYPE } from '../api/queries';
import { WSDL_NS, SOAP_NS, SOAP12_NS } from '../paths';
import CodeViewer from './CodeViewer';
import { ListingTable, TablePagination } from '@wso2/oxygen-ui';
const emptySx = { py: 4, textAlign: 'center', color: 'text.secondary' };
import { useUpdateListenerState } from '../api/mutations';
import { pollPendingListeners } from '../utils/listenerSync';
import { useQueryClient } from '@tanstack/react-query';
import type { TabProps } from './artifact-config';
import { HTTP_METHOD_BADGE_COLORS, DEFAULT_METHOD_BADGE_COLOR, METHOD_BADGE_TEXT_SX, RESOURCE_LABEL_TEXT_SX } from '../constants/methodBadgeStyles';

// Shared style for resource/method display boxes
const getMethodBadgeColor = (method: string) => HTTP_METHOD_BADGE_COLORS[method.toUpperCase()] ?? DEFAULT_METHOD_BADGE_COLOR;

const getResourceRowSx = (method: string) => {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    px: 1,
    py: 0.75,
    border: '0.5px solid',
    borderColor: getMethodBadgeColor(method),
    borderRadius: 0.5,
  } as const;
};

const getMethodBadgeSx = (method: string) =>
  ({
    ...METHOD_BADGE_TEXT_SX,
    bgcolor: getMethodBadgeColor(method),
    color: '#fff',
    px: 1,
    py: 0.5,
    flexShrink: 0,
  }) as const;

const RESOURCE_LABEL_SX = { ...RESOURCE_LABEL_TEXT_SX, flex: 1, color: 'text.primary' } as const;

function ResourceRow({ method, path }: { method: string; path: string }) {
  const upperMethod = method.toUpperCase();

  return (
    <Box sx={{ ...getResourceRowSx(upperMethod), flexWrap: 'wrap' }}>
      <Box sx={getMethodBadgeSx(upperMethod)}>{upperMethod}</Box>
      <Typography sx={RESOURCE_LABEL_SX}>{path}</Typography>
    </Box>
  );
}

export function ArtifactSource({ envId, componentId, artifactType, artifact }: TabProps) {
  const sourceType = ARTIFACT_TYPE_TO_SOURCE_TYPE[artifactType] ?? artifactType.toLowerCase();
  const templateType = artifactType === 'Template' ? (artifact.type as string | undefined) : undefined;
  const { data: source, isLoading, error } = useArtifactSource(envId, componentId, sourceType, artifact.name?.toString() ?? '', artifact.package?.toString(), templateType);
  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (error || !source) return <Typography sx={emptySx}>No source content available.</Typography>;

  return <CodeViewer code={source} language="xml" />;
}

export function ArtifactApiDefinition({ artifact }: TabProps) {
  const resources = (artifact.resources as Array<{ path?: string; methods?: string }> | undefined) ?? [];
  const context = (artifact.context ?? '/*').toString();
  const items = resources.length === 0 ? [{ methods: 'POST', path: context }] : resources;

  const expandedItems: Array<{ method: string; path: string }> = [];
  items.forEach((r) => {
    const methodsStr = (r.methods ?? 'GET').toString();
    const methodsList = methodsStr.split(',').map((m) => m.trim().toUpperCase());
    const path = r.path ?? context;
    methodsList.forEach((method) => {
      expandedItems.push({ method, path });
    });
  });

  return (
    <Stack gap={0.75}>
      {expandedItems.map((item, i) => (
        <ResourceRow key={i} method={item.method} path={item.path} />
      ))}
    </Stack>
  );
}

export function ArtifactEndpoints({ artifact }: TabProps) {
  const endpoints = (artifact.endpoints as string[] | undefined) ?? [];
  return (
    <ListingTable>
      <ListingTable.Head>
        <ListingTable.Row>
          <ListingTable.Cell>Endpoint</ListingTable.Cell>
        </ListingTable.Row>
      </ListingTable.Head>
      <ListingTable.Body>
        {endpoints.length === 0 ? (
          <ListingTable.Row>
            <ListingTable.Cell colSpan={1} align="center" sx={emptySx}>
              No endpoints available.
            </ListingTable.Cell>
          </ListingTable.Row>
        ) : (
          endpoints.map((ep) => (
            <ListingTable.Row key={ep}>
              <ListingTable.Cell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {ep}
                </Typography>
              </ListingTable.Cell>
            </ListingTable.Row>
          ))
        )}
      </ListingTable.Body>
    </ListingTable>
  );
}

export function ServiceResources({ artifact }: TabProps) {
  const resources = (artifact.resources as Array<{ url?: string; methods?: string[] }> | undefined) ?? [];

  const expandedItems: Array<{ method: string; path: string }> = [];
  resources.forEach((r) => {
    const raw = r.methods ?? [];
    const methods = Array.isArray(raw) ? raw : [String(raw)];
    methods.forEach((method) => {
      expandedItems.push({ method: method.toUpperCase(), path: r.url ?? '' });
    });
  });

  return <Stack gap={0.75}>{expandedItems.length === 0 ? <Typography sx={emptySx}>No resources available.</Typography> : expandedItems.map((item, i) => <ResourceRow key={i} method={item.method} path={item.path} />)}</Stack>;
}

// Listener(s) a service is attached to. Backed by Service.listeners, which the
// heartbeat now carries. Each row has an Enable/Disable toggle — a bound listener
// runs on the same runtime(s) as the service, so we target the service's runtimes
// for START/STOP. Disabling a listener stops the service(s) attached to it.
export function ServiceListeners({ artifact, artifactType, envId, componentId }: TabProps) {
  const listeners = (artifact.listeners as Array<{ name?: string; package?: string; protocol?: string; host?: string; port?: number; state?: string }> | undefined) ?? [];
  // A bound listener runs on the same runtime(s) as the service, so we reuse the
  // service's runtimes both for START/STOP and for the details view's Runtimes list.
  const serviceRuntimes = (artifact.runtimes as Array<{ runtimeId: string; runtimeName?: string; status?: string }> | undefined) ?? [];
  const runtimeIds = serviceRuntimes.map((r) => r.runtimeId);
  const hasRuntimes = runtimeIds.length > 0;

  const queryClient = useQueryClient();
  const updateListenerState = useUpdateListenerState();
  const [pending, setPending] = useState<{ name: string; pkg?: string; port?: number; enable: boolean } | null>(null);
  // Per-listener in-flight action. Enable/disable is eventually-consistent — the
  // backend records the intent and the state flips after the next reconcile/heartbeat —
  // so we keep the "Enabling…/Disabling…" busy state until the state actually reflects it.
  const [actions, setActions] = useState<Record<string, 'START' | 'STOP'>>({});
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ name?: string; package?: string; protocol?: string; host?: string; port?: number; state?: string } | null>(null);

  const isEnabled = (s?: string) => String(s ?? '').toLowerCase() === 'enabled';

  // Clear a listener's busy state once its reported state matches the requested action.
  useEffect(() => {
    setActions((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const l of listeners) {
        const name = l.name ?? '';
        const act = next[name];
        if (act && isEnabled(l.state) === (act === 'START')) {
          delete next[name];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [listeners]);

  // The Service query only polls while the service's own state is out of sync, and a listener
  // toggle never changes that, so nothing would refetch after the one refetch onSettled does —
  // which lands before the runtime has applied the command and heartbeated the new state.
  // Poll here instead while any listener is still busy.
  const pendingNames = Object.keys(actions).sort().join(',');
  useEffect(
    () =>
      pollPendingListeners(
        pendingNames ? pendingNames.split(',') : [],
        () => queryClient.invalidateQueries({ queryKey: ['artifacts', artifactType, envId, componentId] }),
        (names) => {
          setActions({});
          setError(`Timed out waiting for ${names.join(', ')} to change state. Refresh to see the current state.`);
        },
      ),
    [pendingNames, queryClient, artifactType, envId, componentId],
  );

  const confirmToggle = () => {
    if (!pending) return;
    const action: 'START' | 'STOP' = pending.enable ? 'START' : 'STOP';
    const name = pending.name;
    setActions((prev) => ({ ...prev, [name]: action }));
    setError(null);
    updateListenerState.mutate(
      { runtimeIds, listenerName: name, listenerPackage: pending.pkg, port: typeof pending.port === 'number' ? pending.port : undefined, action },
      {
        onError: (err) => {
          setActions((prev) => {
            const n = { ...prev };
            delete n[name];
            return n;
          });
          setError(err instanceof Error ? err.message : 'Failed to update listener state');
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: ['artifacts', artifactType, envId, componentId] });
          queryClient.invalidateQueries({ queryKey: ['artifacts', 'Listener', envId, componentId] });
        },
      },
    );
    setPending(null);
  };

  if (listeners.length === 0) {
    return <Typography sx={emptySx}>This service is not attached to any listener.</Typography>;
  }

  return (
    <Stack gap={0.75}>
      {error ? (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      ) : null}
      {listeners.map((l, i) => {
        const name = l.name ?? '';
        const enabled = isEnabled(l.state);
        const hostPort = [l.host, l.port].filter((v) => v !== undefined && v !== null && v !== '').join(':');
        const act = actions[name];
        return (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 0.75, border: '0.5px solid', borderColor: 'divider', borderRadius: 0.5 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {name || '—'}
            </Typography>
            {l.protocol ? <Chip size="small" label={String(l.protocol)} sx={{ height: 20 }} /> : null}
            {hostPort ? (
              <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                {hostPort}
              </Typography>
            ) : null}
            <Box sx={{ flexGrow: 1 }} />
            <Stack direction="row" alignItems="center" gap={0.75}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: enabled ? 'success.main' : 'text.disabled' }} />
              <Typography variant="body2">{enabled ? 'Enabled' : 'Disabled'}</Typography>
            </Stack>
            <Button variant="text" size="small" onClick={() => setDetail(l)} sx={{ fontSize: '12px', flexShrink: 0, textTransform: 'none' }}>
              View Details
            </Button>
            <Tooltip title={!hasRuntimes ? 'No runtimes available' : enabled ? 'Disable listener (stops the service)' : 'Enable listener'}>
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  color={enabled ? 'error' : 'success'}
                  startIcon={act ? <CircularProgress size={12} color="inherit" /> : enabled ? <Square size={14} /> : <Play size={14} />}
                  disabled={act != null || !hasRuntimes}
                  onClick={() => setPending({ name, pkg: l.package, port: l.port, enable: !enabled })}>
                  {act === 'STOP' ? 'Disabling…' : act === 'START' ? 'Enabling…' : enabled ? 'Disable' : 'Enable'}
                </Button>
              </span>
            </Tooltip>
          </Box>
        );
      })}

      <Dialog open={pending !== null} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{pending?.enable ? 'Enable Listener' : 'Disable Listener'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to {pending?.enable ? 'enable' : 'disable'} the listener <strong>{pending?.name}</strong>?{!pending?.enable ? ' Any service attached to it will stop.' : ''}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button variant="contained" color={pending?.enable ? 'success' : 'error'} onClick={confirmToggle}>
            {pending?.enable ? 'Enable' : 'Disable'}
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer
        anchor="right"
        open={detail !== null}
        onClose={() => setDetail(null)}
        sx={{ '& .MuiDrawer-paper': { width: '60%', maxWidth: 700, minWidth: 400, position: 'fixed', top: 64, height: 'calc(100% - 64px)', borderLeft: '1px solid', borderColor: 'divider' } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
            {detail?.name}
          </Typography>
          <IconButton size="small" aria-label="close" onClick={() => setDetail(null)}>
            <X size={16} />
          </IconButton>
        </Stack>
        <Box sx={{ p: 2, overflowY: 'auto' }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10, fontWeight: 600, display: 'block', mb: 1 }}>
            Overview
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', columnGap: 3, rowGap: 2, mb: 3 }}>
            {(
              [
                ['Package', detail?.package],
                ['Protocol', detail?.protocol],
                ['Host', detail?.host],
                ['Port', detail?.port],
                ['State', detail?.state],
              ] as Array<[string, unknown]>
            ).map(([label, v]) => (
              <Box key={label}>
                <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10, fontWeight: 600, display: 'block' }}>
                  {label}
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
                  {v !== undefined && v !== null && v !== '' ? String(v) : '—'}
                </Typography>
              </Box>
            ))}
          </Box>
          <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10, fontWeight: 600, display: 'block', mb: 1 }}>
            Runtimes
          </Typography>
          {serviceRuntimes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No runtimes.
            </Typography>
          ) : (
            <Stack gap={0.5}>
              {serviceRuntimes.map((r) => (
                <Box key={r.runtimeId} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: String(r.status).toUpperCase() === 'RUNNING' ? 'success.main' : 'text.disabled' }} />
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {r.runtimeName || r.runtimeId}
                  </Typography>
                  {r.status ? <Chip size="small" label={String(r.status)} sx={{ height: 20 }} /> : null}
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Drawer>
    </Stack>
  );
}

export function ArtifactWsdl({ envId, componentId, artifactType, artifact }: TabProps) {
  const backendType = ARTIFACT_TYPE_TO_SOURCE_TYPE[artifactType] ?? artifactType.toLowerCase();
  const { data: wsdl, isLoading, error } = useArtifactWsdl(componentId, backendType, artifact.name?.toString() ?? '', envId, undefined, artifact.package?.toString());
  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (error || !wsdl) return <Typography sx={emptySx}>No WSDL content available.</Typography>;
  return <CodeViewer code={wsdl} language="xml" />;
}

export function ArtifactValue({ artifact, envId, componentId }: TabProps) {
  const { data: value, isLoading } = useLocalEntryValue(componentId, artifact.name?.toString() ?? '', envId);
  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (!value) return <Typography sx={emptySx}>No value available.</Typography>;
  return <CodeViewer code={value} language="xml" />;
}

const DATA_SOURCE_OVERVIEW_FIELDS = ['name', 'type', 'description', 'driverClass', 'userName', 'url'];

export function DataSourceOverview({ artifact, envId, componentId }: TabProps) {
  const artifactName = artifact.name?.toString() ?? '';
  const { data: params, isLoading, error } = useDataSourceOverview(componentId, artifactName, envId);
  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (error || !params) return <Typography sx={emptySx}>No overview available.</Typography>;

  const ordered = DATA_SOURCE_OVERVIEW_FIELDS.map((field) => params.find((p) => p.name === field)).filter((p): p is { name: string; value: string } => !!p);
  const rest = params.filter((p) => !DATA_SOURCE_OVERVIEW_FIELDS.includes(p.name));

  return (
    <Stack gap={1.5}>
      {[...ordered, ...rest].map((p) => (
        <Stack key={p.name} direction="row" gap={2} alignItems="baseline">
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120, textTransform: 'capitalize' }}>
            {p.name.replace(/([a-z])([A-Z])/g, '$1 $2')}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {p.value || '—'}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function DataServiceSection<T>({ title, items, renderSummary, renderDetails }: { title: string; items: T[]; renderSummary: (item: T) => string; renderDetails: (item: T) => [string, string][] }) {
  if (items.length === 0) return null;
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Stack gap={0.75}>
        {items.map((item, i) => {
          const details = renderDetails(item);
          // Derive headers from tuple keys if available, else fallback
          let headers: string[] = [];
          if (details.length > 0) {
            // If details are array of tuples, try to use keys if available
            // If details[0] is an array, use default labels
            if (Array.isArray(details[0])) {
              headers = ['Field', 'Value'];
            }
          }
          return (
            <Accordion key={i} disableGutters sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ChevronDown size={16} />} sx={{ bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                  {renderSummary(item)}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ bgcolor: 'background.paper', p: 0 }}>
                <ListingTable>
                  {details.length > 0 && (
                    <ListingTable.Head>
                      <ListingTable.Row>
                        {headers.map((header, idx) => (
                          <ListingTable.Cell key={idx}>{header}</ListingTable.Cell>
                        ))}
                      </ListingTable.Row>
                    </ListingTable.Head>
                  )}
                  <ListingTable.Body>
                    {details.length === 0 ? (
                      <ListingTable.Row>
                        <ListingTable.Cell colSpan={2} align="center" sx={emptySx}>
                          No details.
                        </ListingTable.Cell>
                      </ListingTable.Row>
                    ) : (
                      details.map((row, i) => (
                        <ListingTable.Row key={i}>
                          {row.map((cell, j) => (
                            <ListingTable.Cell key={j}>{cell}</ListingTable.Cell>
                          ))}
                        </ListingTable.Row>
                      ))
                    )}
                  </ListingTable.Body>
                </ListingTable>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
    </Box>
  );
}

export function DataServiceOverview({ artifact, envId, componentId }: TabProps) {
  const artifactName = artifact.name?.toString() ?? '';
  const { data, isLoading, error } = useDataServiceOverview(componentId, artifactName, envId);
  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (error || !data) return <Typography sx={emptySx}>No overview available.</Typography>;

  return (
    <Stack gap={3}>
      {/* Header fields */}
      <Stack gap={1.5}>
        {[
          { label: 'Service Name', value: data.serviceName },
          { label: 'Description', value: data.serviceDescription },
          { label: 'WSDL 1.1', value: data.wsdl1_1 },
          { label: 'WSDL 2.0', value: data.wsdl2_0 },
          { label: 'Swagger URL', value: data.swagger_url },
        ]
          .filter((f) => f.value)
          .map((f) => (
            <Stack key={f.label} direction="row" gap={2} alignItems="baseline">
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }}>
                {f.label}
              </Typography>
              {f.label.includes('WSDL') || f.label.includes('Swagger') ? (
                <Typography variant="body2" component="a" href={f.value} target="_blank" rel="noopener noreferrer" sx={{ wordBreak: 'break-all' }}>
                  {f.value}
                </Typography>
              ) : (
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {f.value}
                </Typography>
              )}
            </Stack>
          ))}
      </Stack>

      <Divider />

      {/* Data Sources */}
      <DataServiceSection
        title="Data Sources"
        items={data.dataSources}
        renderSummary={(item) => {
          const ds = item as { dataSourceId: string; dataSourceType?: string };
          return ds.dataSourceId;
        }}
        renderDetails={(item) => {
          const ds = item as { dataSourceId: string; dataSourceType?: string };
          return [['ID', ds.dataSourceId], ...(ds.dataSourceType ? [['Type', ds.dataSourceType] as [string, string]] : [])];
        }}
      />

      {/* Queries */}
      <DataServiceSection
        title="Queries"
        items={data.queries}
        renderSummary={(item) => (item as { id: string }).id}
        renderDetails={(item) => {
          const q = item as { id: string; dataSourceId?: string };
          return [['ID', q.id], ...(q.dataSourceId ? [['Data Source', q.dataSourceId] as [string, string]] : [])];
        }}
      />

      {/* Resources */}
      <DataServiceSection
        title="Resources"
        items={data.resources}
        renderSummary={(item) => (item as { resourcePath: string }).resourcePath}
        renderDetails={(item) => {
          const r = item as { resourcePath: string; resourceMethod?: string };
          return [['Path', r.resourcePath], ...(r.resourceMethod ? [['Method', r.resourceMethod] as [string, string]] : [])];
        }}
      />

      {/* Operations */}
      <DataServiceSection
        title="Operations"
        items={data.operations}
        renderSummary={(item) => (item as { operationName: string }).operationName}
        renderDetails={(item) => {
          const o = item as { operationName: string; queryName?: string };
          return [['Name', o.operationName], ...(o.queryName ? [['Query', o.queryName] as [string, string]] : [])];
        }}
      />
    </Stack>
  );
}

const MESSAGE_PROCESSOR_OVERVIEW_FIELDS = ['name', 'type', 'messageStore', 'status'];

export function MessageProcessorOverview({ artifact, envId, componentId }: TabProps) {
  const artifactName = artifact.name?.toString() ?? '';
  const { data: params, isLoading, error } = useMessageProcessorOverview(componentId, artifactName, envId);
  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (error || !params) return <Typography sx={emptySx}>No overview available.</Typography>;

  const overviewParams = params.filter((p: { name: string; value: string }) => MESSAGE_PROCESSOR_OVERVIEW_FIELDS.includes(p.name));
  const ordered = MESSAGE_PROCESSOR_OVERVIEW_FIELDS.map((field) => overviewParams.find((p: { name: string; value: string }) => p.name === field)).filter((p): p is { name: string; value: string } => !!p);

  return (
    <Stack gap={1.5}>
      {ordered.map((p) => (
        <Stack key={p.name} direction="row" gap={2} alignItems="baseline">
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120, textTransform: 'capitalize' }}>
            {p.name.replace(/([a-z])([A-Z])/g, '$1 $2')}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {p.value || '—'}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export function MessageProcessorParameters({ artifact, envId, componentId }: TabProps) {
  const artifactName = artifact.name?.toString() ?? '';
  const { data: params, isLoading, error } = useArtifactParams(componentId, 'message-processor', artifactName, envId, undefined, artifact.package?.toString());
  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (error) return <Typography sx={emptySx}>Failed to load parameters.</Typography>;
  if (!params || params.length === 0) return <Typography sx={emptySx}>No parameters found.</Typography>;
  return (
    <ListingTable>
      <ListingTable.Head>
        <ListingTable.Row>
          <ListingTable.Cell>Name</ListingTable.Cell>
          <ListingTable.Cell>Value</ListingTable.Cell>
        </ListingTable.Row>
      </ListingTable.Head>
      <ListingTable.Body>
        {params.length === 0 ? (
          <ListingTable.Row>
            <ListingTable.Cell colSpan={2} align="center" sx={emptySx}>
              No parameters found.
            </ListingTable.Cell>
          </ListingTable.Row>
        ) : (
          params.map((p, i) => (
            <ListingTable.Row key={i}>
              <ListingTable.Cell>{p.name}</ListingTable.Cell>
              <ListingTable.Cell>{p.value}</ListingTable.Cell>
            </ListingTable.Row>
          ))
        )}
      </ListingTable.Body>
    </ListingTable>
  );
}

export function ArtifactCarbonArtifacts({ artifact }: TabProps) {
  const artifacts = (artifact.artifacts as Array<{ name: string; type: string }> | undefined) ?? [];
  return (
    <ListingTable>
      <ListingTable.Head>
        <ListingTable.Row>
          <ListingTable.Cell>Artifact Name</ListingTable.Cell>
          <ListingTable.Cell>Artifact Type</ListingTable.Cell>
        </ListingTable.Row>
      </ListingTable.Head>
      <ListingTable.Body>
        {artifacts.length === 0 ? (
          <ListingTable.Row>
            <ListingTable.Cell colSpan={2} align="center" sx={emptySx}>
              No artifacts found.
            </ListingTable.Cell>
          </ListingTable.Row>
        ) : (
          artifacts.map((a, i) => (
            <ListingTable.Row key={i}>
              <ListingTable.Cell>{a.name}</ListingTable.Cell>
              <ListingTable.Cell>{a.type}</ListingTable.Cell>
            </ListingTable.Row>
          ))
        )}
      </ListingTable.Body>
    </ListingTable>
  );
}

export function ArtifactRuntimes({ artifact }: TabProps) {
  const runtimes = (artifact.runtimes as Array<{ runtimeId: string; runtimeName?: string; status: string }> | undefined) ?? [];

  return (
    <ListingTable>
      <ListingTable.Head>
        <ListingTable.Row>
          <ListingTable.Cell>Runtime Name</ListingTable.Cell>
          <ListingTable.Cell>Runtime ID</ListingTable.Cell>
          <ListingTable.Cell>Status</ListingTable.Cell>
        </ListingTable.Row>
      </ListingTable.Head>
      <ListingTable.Body>
        {runtimes.length === 0 ? (
          <ListingTable.Row>
            <ListingTable.Cell colSpan={3} align="center" sx={emptySx}>
              No runtimes found.
            </ListingTable.Cell>
          </ListingTable.Row>
        ) : (
          runtimes.map((r, i) => (
            <ListingTable.Row key={i}>
              <ListingTable.Cell>
                <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.runtimeName || r.runtimeId}</Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.runtimeId}</Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2" color={r.status === 'RUNNING' ? 'success.main' : 'error.main'} sx={{ fontWeight: 600 }}>
                  {r.status}
                </Typography>
              </ListingTable.Cell>
            </ListingTable.Row>
          ))
        )}
      </ListingTable.Body>
    </ListingTable>
  );
}

export function InboundEndpointParameters({ artifact, envId, componentId, artifactType }: TabProps) {
  const artifactName = artifact.name?.toString() ?? '';
  const backendType = ARTIFACT_TYPE_TO_SOURCE_TYPE[artifactType] ?? artifactType.toLowerCase();
  const { data: params, isLoading, error } = useArtifactParams(componentId, backendType, artifactName, envId, undefined, artifact.package?.toString());
  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (error) return <Typography sx={emptySx}>Failed to load parameters.</Typography>;
  if (!params || params.length === 0) return <Typography sx={emptySx}>No parameters found.</Typography>;

  const rows: [string, string][] = [];
  for (const p of params) {
    if (p.name === 'parameters') {
      try {
        const parsed = JSON.parse(p.value);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item.name === 'string' && typeof item.value === 'string') {
              rows.push([item.name, item.value]);
            }
          }
        } else {
          rows.push([p.name, p.value]);
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          rows.push([p.name, p.value]);
        }
      }
    } else {
      rows.push([p.name, p.value]);
    }
  }

  return (
    <ListingTable>
      <ListingTable.Head>
        <ListingTable.Row>
          <ListingTable.Cell>Name</ListingTable.Cell>
          <ListingTable.Cell>Value</ListingTable.Cell>
        </ListingTable.Row>
      </ListingTable.Head>
      <ListingTable.Body>
        {rows.length === 0 ? (
          <ListingTable.Row>
            <ListingTable.Cell colSpan={2} align="center" sx={emptySx}>
              No parameters found.
            </ListingTable.Cell>
          </ListingTable.Row>
        ) : (
          rows.map((row, i) => (
            <ListingTable.Row key={i}>
              <ListingTable.Cell>{row[0]}</ListingTable.Cell>
              <ListingTable.Cell>{row[1]}</ListingTable.Cell>
            </ListingTable.Row>
          ))
        )}
      </ListingTable.Body>
    </ListingTable>
  );
}

// ── WSDL parsing helpers ─────────────────────────────────────────────────────

interface WsdlOperation {
  name: string;
  soapAction?: string;
  style?: string;
  inputMessage?: string;
  outputMessage?: string;
}

interface WsdlInfo {
  serviceName: string;
  targetNamespace: string;
  operations: WsdlOperation[];
}

function getByNs(parent: Document | Element, ns: string, localName: string): Element[] {
  const result = Array.from(parent.getElementsByTagNameNS(ns, localName));
  // Return empty array if namespace-aware query fails to avoid conflating elements from different namespaces
  return result;
}

function parseWsdl(xml: string): WsdlInfo | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return null;

    const defs = doc.documentElement;
    const serviceEls = getByNs(doc, WSDL_NS, 'service');

    // Return null if required service name is missing
    const serviceName = serviceEls[0]?.getAttribute('name') ?? defs.getAttribute('name');
    if (!serviceName) return null;

    // Target namespace is required for valid WSDL
    const targetNamespace = defs.getAttribute('targetNamespace');
    if (!targetNamespace) return null;

    // Build soap:operation index keyed by operation name
    const soapInfo: Record<string, { soapAction?: string; style?: string }> = {};
    for (const ns of [SOAP_NS, SOAP12_NS]) {
      for (const soapOp of getByNs(doc, ns, 'operation')) {
        const bindingOpEl = soapOp.parentElement;
        const opName = bindingOpEl?.getAttribute('name');
        if (opName) {
          soapInfo[opName] = {
            soapAction: soapOp.getAttribute('soapAction') ?? undefined,
            style: soapOp.getAttribute('style') ?? undefined,
          };
        }
      }
    }

    // Get operations from the first portType
    const portTypeEls = getByNs(doc, WSDL_NS, 'portType');
    const opEls = portTypeEls[0] ? getByNs(portTypeEls[0], WSDL_NS, 'operation') : [];

    const operations: WsdlOperation[] = [];
    for (const opEl of opEls) {
      const name = opEl.getAttribute('name');
      if (!name) continue;

      const inputEl = getByNs(opEl, WSDL_NS, 'input')[0];
      const outputEl = getByNs(opEl, WSDL_NS, 'output')[0];
      operations.push({
        name,
        inputMessage: inputEl?.getAttribute('message')?.split(':').pop(),
        outputMessage: outputEl?.getAttribute('message')?.split(':').pop(),
        ...soapInfo[name],
      });
    }

    return { serviceName, targetNamespace, operations };
  } catch {
    return null;
  }
}

// ── Proxy API Reference (Swagger-like SOAP UI) ────────────────────────────────

function OperationRow({ op }: { op: WsdlOperation }) {
  return (
    <Accordion disableGutters sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ChevronDown size={16} />} sx={{ bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Chip label="SOAP" size="small" sx={{ bgcolor: '#1565c0', color: 'white', fontWeight: 700, fontSize: '0.7rem', height: 22, borderRadius: 1 }} />
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
            {op.name}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ bgcolor: 'background.paper' }}>
        <Stack gap={0.75}>
          {op.soapAction && (
            <Stack direction="row" gap={1} alignItems="baseline">
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100 }}>
                SOAP Action
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {op.soapAction}
              </Typography>
            </Stack>
          )}
          {op.style && (
            <Stack direction="row" gap={1} alignItems="baseline">
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100 }}>
                Style
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {op.style}
              </Typography>
            </Stack>
          )}
          {op.inputMessage && (
            <Stack direction="row" gap={1} alignItems="baseline">
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100 }}>
                Input
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {op.inputMessage}
              </Typography>
            </Stack>
          )}
          {op.outputMessage && (
            <Stack direction="row" gap={1} alignItems="baseline">
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100 }}>
                Output
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {op.outputMessage}
              </Typography>
            </Stack>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

export function ProxyApiReference({ envId, componentId, artifactType, artifact }: TabProps) {
  const backendType = ARTIFACT_TYPE_TO_SOURCE_TYPE[artifactType] ?? artifactType.toLowerCase();
  const { data: wsdl, isLoading, error } = useArtifactWsdl(componentId, backendType, artifact.name?.toString() ?? '', envId, undefined, artifact.package?.toString());

  const info = useMemo(() => (wsdl ? parseWsdl(wsdl) : null), [wsdl]);

  if (isLoading) return <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />;
  if (error || !wsdl) return <Typography sx={emptySx}>No WSDL content available.</Typography>;
  if (!info) return <Typography sx={emptySx}>Could not parse WSDL.</Typography>;

  return (
    <Stack gap={2}>
      <Card variant="outlined" sx={{ '& .MuiCardContent-root:last-child': { pb: 1.5 } }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {info.serviceName}
          </Typography>
          {info.targetNamespace && (
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
              Namespace: {info.targetNamespace}
            </Typography>
          )}
        </CardContent>
      </Card>
      <Box>
        <Divider sx={{ mb: 1.5 }} />
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          Operations ({info.operations.length})
        </Typography>
        {info.operations.length === 0 ? (
          <Typography sx={emptySx}>No operations found.</Typography>
        ) : (
          <Stack gap={1}>
            {info.operations.map((op) => (
              <OperationRow key={op.name} op={op} />
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

export function AutomationExecutions({ artifact }: TabProps) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: 'timestamp' | 'runtimeName' | 'runtimeId' | 'status'; direction: 'asc' | 'desc' }>({ key: 'timestamp', direction: 'desc' });
  const runtimes = (artifact.runtimes as Array<{ runtimeId: string; runtimeName?: string; status: string; executionTimestamps: string[] }> | undefined) ?? [];
  const allExecutions: Array<{ runtimeId: string; runtimeName?: string; timestamp: string; status: string }> = [];

  runtimes.forEach((runtime) => {
    const timestamps = runtime.executionTimestamps ?? [];
    timestamps.forEach((timestamp) => {
      allExecutions.push({
        runtimeId: runtime.runtimeId,
        runtimeName: runtime.runtimeName,
        timestamp,
        status: runtime.status,
      });
    });
  });

  // Filter by search
  const filtered = allExecutions.filter((exec) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (exec.runtimeName || '').toLowerCase().includes(q) || exec.runtimeId.toLowerCase().includes(q) || exec.status.toLowerCase().includes(q) || exec.timestamp.toLowerCase().includes(q);
  });

  // Sort by selected column
  const sorted = [...filtered].sort((a, b) => {
    const { key, direction } = sort;
    const aValue = a[key];
    const bValue = b[key];
    if (key === 'timestamp') {
      // Compare as numbers (date ms) if sorting by timestamp
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return direction === 'asc' ? aTime - bTime : bTime - aTime;
    }
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const cmp = aValue.localeCompare(bValue);
      return direction === 'asc' ? cmp : -cmp;
    }
    return 0;
  });

  return (
    <Stack gap={1}>
      <Box sx={{ mb: 1, width: '100%', maxWidth: 400 }}>
        <SearchField
          value={search}
          onChange={(val: string) => {
            setSearch(val);
            setPage(0);
          }}
          placeholder="Search executions..."
          fullWidth
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 1,
            boxShadow: 0,
            '& .MuiOutlinedInput-root': {
              px: 1.5,
              py: 1,
              fontSize: 14,
            },
          }}
        />
      </Box>
      <ListingTable>
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>
              <ListingTable.SortLabel
                active={sort.key === 'timestamp'}
                direction={sort.key === 'timestamp' ? sort.direction : 'asc'}
                onClick={() => setSort((prev) => ({ key: 'timestamp', direction: prev.key === 'timestamp' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                Timestamp
              </ListingTable.SortLabel>
            </ListingTable.Cell>
            <ListingTable.Cell>
              <ListingTable.SortLabel
                active={sort.key === 'runtimeName'}
                direction={sort.key === 'runtimeName' ? sort.direction : 'asc'}
                onClick={() => setSort((prev) => ({ key: 'runtimeName', direction: prev.key === 'runtimeName' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                Runtime Name
              </ListingTable.SortLabel>
            </ListingTable.Cell>
            <ListingTable.Cell>
              <ListingTable.SortLabel
                active={sort.key === 'runtimeId'}
                direction={sort.key === 'runtimeId' ? sort.direction : 'asc'}
                onClick={() => setSort((prev) => ({ key: 'runtimeId', direction: prev.key === 'runtimeId' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                Runtime ID
              </ListingTable.SortLabel>
            </ListingTable.Cell>
            <ListingTable.Cell>
              <ListingTable.SortLabel
                active={sort.key === 'status'}
                direction={sort.key === 'status' ? sort.direction : 'asc'}
                onClick={() => setSort((prev) => ({ key: 'status', direction: prev.key === 'status' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                Status
              </ListingTable.SortLabel>
            </ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {sorted.length === 0 ? (
            <ListingTable.Row>
              <ListingTable.Cell colSpan={4} align="center" sx={emptySx}>
                No executions found.
              </ListingTable.Cell>
            </ListingTable.Row>
          ) : (
            sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((exec, i) => (
              <ListingTable.Row key={i}>
                <ListingTable.Cell>
                  <Typography variant="body2">{new Date(exec.timestamp).toLocaleString()}</Typography>
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{exec.runtimeName || exec.runtimeId}</Typography>
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>{exec.runtimeId}</Typography>
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <Typography variant="body2" color={exec.status === 'ONLINE' ? 'success.main' : 'text.secondary'} sx={{ fontWeight: 600 }}>
                    {exec.status}
                  </Typography>
                </ListingTable.Cell>
              </ListingTable.Row>
            ))
          )}
        </ListingTable.Body>
      </ListingTable>
      <TablePagination
        component="div"
        count={sorted.length}
        page={page}
        onPageChange={(_: unknown, newPage: number) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
      />
    </Stack>
  );
}
