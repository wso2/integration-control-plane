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

import { Box, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Check, CodeXml, Copy, Settings, ShieldCheck, SlidersHorizontal, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ApimApiOperation } from '../../../types/apim';
import { getHttpMethodColors } from '../../../utils/httpMethods';

interface McpProxyCanvasProps {
  operations: ApimApiOperation[];
  /** Backend endpoint the MCP server fronts (the "Service Contract"). */
  backendEndpoint: string | null;
  searchText: string;
  /** Opens the API-policies drawer (the "Add API Policy" action). */
  onAddPolicy: () => void;
  onConfigureSecurity: () => void;
  /** Opens the OpenAPI spec drawer (the Service Contract action). */
  onViewContract: () => void;
  onConfigureTool: (op: ApimApiOperation) => void;
  onDeleteTool: (op: ApimApiOperation) => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);
  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
      <IconButton size="small" onClick={onCopy} sx={{ p: 0.25, flexShrink: 0 }}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </IconButton>
    </Tooltip>
  );
}

/** A connector that visually links a left tool tile to its backend operation. */
function Connector({ color }: { color: string }) {
  const dot = { position: 'absolute' as const, top: '50%', width: 7, height: 7, borderRadius: '50%', bgcolor: color, transform: 'translateY(-50%)' };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5 }}>
      <Box sx={{ position: 'relative', flex: 1, height: '2px', bgcolor: color, opacity: 0.55, borderRadius: 1 }}>
        <Box sx={{ ...dot, left: -3 }} />
        <Box sx={{ ...dot, right: -3 }} />
      </Box>
    </Box>
  );
}

/** A node card — the "MCP Server" / "Service Contract" boxes at the top. */
function NodeCard({ title, icons, fieldLabel, fieldValue, placeholder }: { title: string; icons: ReactNode; fieldLabel: string; fieldValue: string | null; placeholder: string }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', p: 1.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Stack direction="row" alignItems="center" gap={0.25}>
          {icons}
        </Stack>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25, mb: 0.25 }}>
        {fieldLabel}
      </Typography>
      <TextField
        size="small"
        fullWidth
        value={fieldValue ?? ''}
        placeholder={placeholder}
        slotProps={{
          input: {
            readOnly: true,
            endAdornment: fieldValue ? <CopyButton value={fieldValue} /> : undefined,
            sx: { fontFamily: 'monospace', fontSize: '0.75rem' },
          },
        }}
      />
    </Box>
  );
}

/**
 * The MCP "policy" canvas: an MCP Server node (with Add API Policy / Configure
 * Security / view-spec actions) linked to its Service Contract by method-coloured
 * connectors, one row per exposed tool. Per-tool configure/delete live on each row.
 */
export default function McpProxyCanvas({ operations, backendEndpoint, searchText, onAddPolicy, onConfigureSecurity, onViewContract, onConfigureTool, onDeleteTool }: McpProxyCanvasProps): ReactNode {
  const rows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const sorted = [...operations].sort((a, b) => (a.target === b.target ? a.verb.localeCompare(b.verb) : a.target.localeCompare(b.target)));
    if (!q) return sorted;
    return sorted.filter((op) => op.target.toLowerCase().includes(q) || op.verb.toLowerCase().includes(q));
  }, [operations, searchText]);

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'action.hover', p: { xs: 2, md: 3 }, overflowX: 'auto' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 104px minmax(220px, 1fr)', columnGap: 0, rowGap: 1.5, alignItems: 'center', minWidth: 620 }}>
        {/* Header nodes */}
        <NodeCard
          title="MCP Server"
          icons={
            <>
              <Tooltip title="Add API Policy">
                <IconButton size="small" onClick={onAddPolicy}>
                  <SlidersHorizontal size={15} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Configure Security">
                <IconButton size="small" onClick={onConfigureSecurity}>
                  <ShieldCheck size={15} />
                </IconButton>
              </Tooltip>
            </>
          }
          fieldLabel="URL"
          fieldValue={null}
          placeholder="Deploy to view the URL"
        />
        <Box />
        <NodeCard
          title="Service Contract"
          icons={
            <Tooltip title="View OpenAPI spec">
              <IconButton size="small" onClick={onViewContract}>
                <CodeXml size={15} />
              </IconButton>
            </Tooltip>
          }
          fieldLabel="Endpoint"
          fieldValue={backendEndpoint}
          placeholder="No backend endpoint"
        />

        {/* Tool ↔ operation rows */}
        {rows.map((op) => {
          const colors = getHttpMethodColors(op.verb);
          return (
            <Fragment key={`${op.verb} ${op.target}`}>
              {/* Left: MCP tool tile */}
              <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 44, pl: 1.5, pr: 1, border: '1px solid', borderColor: colors.badgeBg, bgcolor: colors.cardBg, borderRadius: 1.5 }}>
                <Typography sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8125rem', fontWeight: 500, wordBreak: 'break-all', color: 'text.primary' }}>{op.target}</Typography>
                <Tooltip title="Configure tool">
                  <IconButton size="small" onClick={() => onConfigureTool(op)} sx={{ p: 0.25, color: 'text.secondary' }}>
                    <Settings size={14} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete tool">
                  <IconButton size="small" onClick={() => onDeleteTool(op)} sx={{ p: 0.25, color: 'error.main' }}>
                    <Trash2 size={14} />
                  </IconButton>
                </Tooltip>
                <Box sx={{ position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)', width: 9, height: 9, borderRadius: '50%', bgcolor: colors.badgeBg, border: '2px solid', borderColor: 'background.paper' }} />
              </Box>

              {/* Middle: connector */}
              <Connector color={colors.badgeBg} />

              {/* Right: backend operation tile */}
              <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1, minHeight: 44, px: 1.25, border: '1px solid', borderColor: colors.border, bgcolor: colors.cardBg, borderRadius: 1.5 }}>
                <Box sx={{ position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)', width: 9, height: 9, borderRadius: '50%', bgcolor: colors.badgeBg, border: '2px solid', borderColor: 'background.paper' }} />
                <Box sx={{ bgcolor: colors.badgeBg, color: '#fff', fontWeight: 700, fontSize: '11px', minWidth: 64, px: 1, py: 0.5, borderRadius: 0.75, textAlign: 'center', flexShrink: 0 }}>{op.verb.toUpperCase()}</Box>
                <Typography sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8125rem', fontWeight: 500, wordBreak: 'break-all', color: 'text.primary' }}>{op.target}</Typography>
              </Box>
            </Fragment>
          );
        })}
      </Box>

      {rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          {operations.length === 0 ? 'This MCP server exposes no tools yet.' : 'No tools match your filter.'}
        </Typography>
      )}
    </Box>
  );
}
