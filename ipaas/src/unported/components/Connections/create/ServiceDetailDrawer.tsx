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

import { Alert, Avatar, Box, Button, Chip, CircularProgress, Divider, Drawer, IconButton, Skeleton, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { Download, X } from '@wso2/oxygen-ui-icons-react';
import { lazy, Suspense, useEffect, useMemo, useState, type JSX } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { useConnectionServiceIdl } from '../../../hooks/useConnections';
const Markdown = lazy(() => import('../../../../components/Markdown'));
import type { ConnectionCatalogItem } from '../../../../types/connections';

interface ServiceDetailDrawerProps {
  item: ConnectionCatalogItem | null;
  onClose: () => void;
  onSelect: (item: ConnectionCatalogItem) => void;
}

/** Read-only contract view: keep the full spec (info, operations, schemas) but disable try-it-out. */
const disableTryItOut = () => ({
  statePlugins: { spec: { wrapSelectors: { allowTryItOutFor: () => () => false } } },
});

function titleCase(s: string): string {
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1).toLowerCase()}` : s;
}

function ApiDefinition({ serviceId }: { serviceId: string }): JSX.Element {
  const { data: idl, isLoading, isError, refetch } = useConnectionServiceIdl(serviceId);
  const raw = idl?.content ?? '';
  const spec = useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }, [raw]);

  const download = () => {
    const isJson = raw.trimStart().startsWith('{');
    const blob = new Blob([raw], { type: isJson ? 'application/json' : 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${serviceId}-openapi.${isJson ? 'json' : 'yaml'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <Skeleton variant="rounded" height={320} sx={{ mt: 2 }} />;
  if (isError || !spec) {
    return (
      <Alert
        severity="error"
        sx={{ mt: 2 }}
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Failed to load the API definition.
      </Alert>
    );
  }
  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
        <Button size="small" startIcon={<Download size={16} />} onClick={download}>
          Download
        </Button>
      </Stack>
      <Box sx={{ '& .swagger-ui .topbar': { display: 'none' }, '& .swagger-ui .scheme-container': { boxShadow: 'none', p: 0 } }}>
        <SwaggerUI spec={spec} docExpansion="list" defaultModelsExpandDepth={-1} plugins={[disableTryItOut]} />
      </Box>
    </Box>
  );
}

/**
 * Service-details overlay opened from a card's external-link icon. Mirrors Devant's OverlayDrawer +
 * ServiceContent (ServiceView): header with name/version/summary/type/status/tags, and Overview /
 * API Definition tabs.
 */
export default function ServiceDetailDrawer({ item, onClose, onSelect }: ServiceDetailDrawerProps): JSX.Element {
  const [tab, setTab] = useState(0);

  useEffect(() => setTab(0), [item?.serviceId]);

  return (
    <Drawer anchor="right" open={!!item} onClose={onClose} variant="temporary" sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', md: '70%', lg: '62%' }, maxWidth: 1180, top: { xs: '56px', sm: '64px' }, height: 'auto', bottom: 0 } }}>
      {item && (
        <Stack sx={{ height: '100%' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Service details
            </Typography>
            <IconButton size="small" aria-label="close" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </Stack>

          <Box sx={{ px: 3, pt: 2.5 }}>
            <Stack direction="row" gap={2} alignItems="flex-start">
              <Avatar variant="rounded" sx={{ width: 44, height: 44, fontSize: '1.1rem', fontWeight: 700, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                {(item.name[0] ?? '?').toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {item.name}
                  </Typography>
                  {item.version && <Chip label={`Version: ${item.version}`} size="small" variant="outlined" sx={{ color: 'primary.main', borderColor: 'primary.main' }} />}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  {item.summary || item.description || 'No summary provided'}
                </Typography>
                <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>
                  {item.serviceType && <Chip label={item.serviceType} size="small" variant="outlined" />}
                  {item.visibility && item.visibility.length > 0 && <Chip label={`Visibility: ${titleCase(item.visibility[0])}`} size="small" variant="outlined" />}
                  {item.status && <Chip label={`Status: ${titleCase(item.status)}`} size="small" variant="outlined" />}
                  {(item.tags ?? []).map((t) => (
                    <Chip key={t} label={t} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Box>
            </Stack>

            <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mt: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Tab label="Overview" sx={{ textTransform: 'none', minHeight: 44 }} />
              <Tab label="API Definition" sx={{ textTransform: 'none', minHeight: 44 }} />
            </Tabs>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
            {tab === 0 ? (
              item.description ? (
                <Suspense fallback={null}>
                  <Markdown>{item.description}</Markdown>
                </Suspense>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No description provided.
                </Typography>
              )
            ) : (
              <ApiDefinition serviceId={item.serviceId} />
            )}
          </Box>

          <Divider />
          <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 3, py: 2 }}>
            <Button onClick={onClose}>Close</Button>
            <Button variant="contained" onClick={() => onSelect(item)} startIcon={tab === -1 ? <CircularProgress size={16} /> : undefined}>
              Create Connection
            </Button>
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}
