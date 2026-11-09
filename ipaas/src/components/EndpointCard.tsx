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

import { Box, Chip, Collapse, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Building2, Check, ChevronDown, ChevronUp, Copy, Folder, Globe, Pencil, Settings } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useState } from 'react';
import type { EnvEndpoint } from '../types/component';

// eslint-disable-next-line react-refresh/only-export-components
export const VISIBILITY_OPTS = [
  {
    key: 'Public',
    label: 'Public',
    Icon: Globe,
    description: 'Allows any client to access the endpoint, regardless of location or organization.',
  },
  {
    key: 'Organization',
    label: 'Organization',
    Icon: Building2,
    description: 'Allows any integration within the same organization to access the endpoint.',
  },
  {
    key: 'Project',
    label: 'Project',
    Icon: Folder,
    description: 'Allows any integration within the same project to access the endpoint.',
  },
] as const;

// eslint-disable-next-line react-refresh/only-export-components
export function getStatusColor(state?: string | null) {
  if (!state) return 'text.disabled';
  const s = state.toUpperCase();
  if (s === 'ACTIVE') return 'success.main';
  if (s === 'ERROR') return 'error.main';
  if (s === 'IN_PROGRESS' || s === 'PENDING' || s === 'PROGRESSING') return 'warning.main';
  return 'text.disabled';
}

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
      <IconButton aria-label="Copy" size="small" onClick={handle} sx={{ p: 0.25, flexShrink: 0 }}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </IconButton>
    </Tooltip>
  );
}

export interface EndpointCardProps {
  ep: EnvEndpoint;
  onEdit?: (ep: EnvEndpoint) => void;
  onSettings?: (ep: EnvEndpoint) => void;
  defaultExpanded?: boolean;
  readOnly?: boolean;
  /**
   * Set when Agent Manager's AI gateway fronts the endpoint, as it does an MCP server: its public proxy URL, or ''
   * before the proxy has one. The gateway serves public callers only and the BFF refuses visibility and API settings
   * for it, so the card offers neither and shows the proxy as the one way in.
   */
  aiGatewayUrl?: string;
  /**
   * Whether the AI gateway fronts the endpoint is still being read. Its URLs wait: shown now, an AI gateway
   * endpoint's would be its own route, which callers are not meant to use.
   */
  urlsPending?: boolean;
}

export function EndpointCard({ ep, onEdit, onSettings, defaultExpanded = false, readOnly = false, aiGatewayUrl, urlsPending = false }: EndpointCardProps) {
  const [open, setOpen] = useState(defaultExpanded);
  const onAiGateway = aiGatewayUrl !== undefined;
  const canEdit = !readOnly && !onAiGateway && !!onEdit;
  const openSettings = onAiGateway ? undefined : onSettings;
  const visRows = VISIBILITY_OPTS.map((v) => {
    const url = v.key === 'Public' ? ep.publicUrl || ep.defaultPublicUrl || ep.invokeUrl || '' : v.key === 'Organization' ? ep.organizationUrl || ep.defaultOrganizationUrl || '' : ep.projectUrl || '';
    const active = ep.networkVisibilities?.length ? ep.networkVisibilities.includes(v.key) : ep.visibility === v.key;
    return { ...v, url, active };
  }).filter((r) => r.url && r.active);

  const fallbackUrl = visRows.length === 0 && ep.visibility === 'Public' ? ep.invokeUrl || '' : '';

  return (
    <Box sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" gap={1} sx={{ px: 1.5, py: 1, borderBottom: open ? '1px solid' : 'none', borderColor: 'divider' }}>
        {/* Status dot */}
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getStatusColor(ep.state), flexShrink: 0 }} onClick={() => setOpen((p) => !p)} />
        {/* Name */}
        <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => setOpen((p) => !p)}>
          {ep.displayName}
        </Typography>
        {/* Edit — hidden in readOnly mode */}
        {canEdit && (
          <Tooltip title="Edit endpoint">
            <IconButton
              aria-label="Edit endpoint"
              size="small"
              sx={{ p: 0.5, flexShrink: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(ep);
              }}>
              <Pencil size={14} />
            </IconButton>
          </Tooltip>
        )}
        {/* Settings — always shown when provided (even in readOnly) */}
        {openSettings && (
          <Tooltip title="API settings">
            <IconButton
              aria-label="API settings"
              size="small"
              sx={{ p: 0.5, flexShrink: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                openSettings(ep);
              }}>
              <Settings size={14} />
            </IconButton>
          </Tooltip>
        )}
        {/* Chevron */}
        <Tooltip title={open ? 'Collapse' : 'Expand'}>
          <IconButton aria-label={open ? 'Collapse endpoint' : 'Expand endpoint'} size="small" sx={{ p: 0.25, flexShrink: 0 }} onClick={() => setOpen((p) => !p)}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Expanded content */}
      <Collapse in={open}>
        <Box sx={{ px: 1.5, py: 1.25 }}>
          {/* Details box */}
          <Box sx={{ mb: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1 }}>
            {[
              { label: 'Port', value: ep.port != null ? String(ep.port) : null },
              { label: 'Status', value: ep.state ?? null },
              { label: 'Type', value: ep.type ?? null },
              { label: 'Context', value: ep.apiContext ?? null },
              { label: 'Schema', value: ep.apiDefinitionPath ?? null },
            ].map(({ label, value }) =>
              value ? (
                <Stack key={label} direction="row" alignItems="center" sx={{ py: 0.3 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, width: 72, flexShrink: 0 }}>
                    {label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: label === 'Schema' ? 'monospace' : undefined }}>
                    {value}
                  </Typography>
                </Stack>
              ) : null,
            )}
            {!onAiGateway && ep.networkVisibilities && ep.networkVisibilities.length > 0 && (
              <Stack direction="row" alignItems="center" sx={{ py: 0.3 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, width: 72, flexShrink: 0 }}>
                  Visibility
                </Typography>
                <Stack direction="row" gap={0.5} flexWrap="wrap">
                  {ep.networkVisibilities.map((v) => (
                    <Chip key={v} label={v} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />
                  ))}
                </Stack>
              </Stack>
            )}
          </Box>

          {/* URLs box */}
          {urlsPending ? null : onAiGateway ? (
            <AiGatewayUrl url={aiGatewayUrl} />
          ) : (
            (visRows.length > 0 || fallbackUrl) && (
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                {visRows.map((r, i) => (
                  <Box key={r.key} sx={{ px: 1.5, py: 0.75, borderBottom: i < visRows.length - 1 || !!fallbackUrl ? '1px solid' : 'none', borderColor: 'divider' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.25 }}>
                      {r.label} URL
                    </Typography>
                    <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
                      <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                        {r.url}
                      </Typography>
                      <CopyBtn text={r.url} />
                    </Stack>
                  </Box>
                ))}
                {fallbackUrl && (
                  <Box sx={{ px: 1.5, py: 0.75 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.25 }}>
                      Public URL
                    </Typography>
                    <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
                      <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                        {fallbackUrl}
                      </Typography>
                      <CopyBtn text={fallbackUrl} />
                    </Stack>
                  </Box>
                )}
              </Box>
            )
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

/** An AI gateway endpoint's one way in: its public proxy URL, or a note while the proxy has none. */
function AiGatewayUrl({ url }: { url: string }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 0.75 }}>
      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.25 }}>
        Public URL
      </Typography>
      {url ? (
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
            {url}
          </Typography>
          <CopyBtn text={url} />
        </Stack>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Not published on the AI gateway yet.
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        Served publicly through the AI gateway.
      </Typography>
    </Box>
  );
}
