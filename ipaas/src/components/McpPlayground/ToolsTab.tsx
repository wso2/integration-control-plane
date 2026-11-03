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

import { Box, Button, CircularProgress, IconButton, List, ListItemButton, ListItemText, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Play, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { generateDefaultValue } from '../../utils/mcp';
import DynamicJsonForm from './DynamicJsonForm';
import ToolResult from './ToolResult';
import type { JsonValue, McpTool, McpToolResult } from '../../types/mcp';

interface ToolsTabProps {
  tools: McpTool[];
  loading: boolean;
  callTool: (name: string, args: Record<string, JsonValue>) => Promise<McpToolResult>;
  onRefresh: () => void;
}

/** Argument form + Run + result for a single selected tool (keyed by tool name, so state resets on switch). */
function ToolPanel({ tool, callTool }: { tool: McpTool; callTool: ToolsTabProps['callTool'] }): JSX.Element {
  const [args, setArgs] = useState<Record<string, JsonValue>>(() => (tool.inputSchema ? (generateDefaultValue(tool.inputSchema) as Record<string, JsonValue>) : {}));
  const [result, setResult] = useState<McpToolResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setResult(await callTool(tool.name, args));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Stack gap={2}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {tool.name}
        </Typography>
        {tool.description && (
          <Typography variant="body2" color="text.secondary">
            {tool.description}
          </Typography>
        )}
      </Box>

      <DynamicJsonForm schema={tool.inputSchema} value={args} onChange={setArgs} />

      <Box>
        <Button variant="contained" size="small" startIcon={running ? <CircularProgress size={14} color="inherit" /> : <Play size={16} />} disabled={running} onClick={() => void run()}>
          {running ? 'Running…' : 'Run tool'}
        </Button>
      </Box>

      {result && <ToolResult result={result} />}
    </Stack>
  );
}

/** The Tools tab: a list of the server's tools on the left, the selected tool's runner on the right. */
export default function ToolsTab({ tools, loading, callTool, onRefresh }: ToolsTabProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const activeName = selected && tools.some((t) => t.name === selected) ? selected : (tools[0]?.name ?? null);
  const activeTool = tools.find((t) => t.name === activeName) ?? null;

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} sx={{ height: '100%', minHeight: 0 }}>
      <Box sx={{ width: { xs: '100%', md: 280 }, flexShrink: 0, borderRight: { md: '1px solid' }, borderColor: { md: 'divider' }, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Tools
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Refresh tools">
            <span>
              <IconButton size="small" aria-label="Refresh tools" onClick={onRefresh} disabled={loading}>
                <RefreshCw size={14} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {loading ? (
            <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', my: 3 }} />
          ) : tools.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              This server does not expose any tools.
            </Typography>
          ) : (
            <List dense disablePadding sx={{ p: 1 }}>
              {tools.map((tool) => (
                <ListItemButton key={tool.name} selected={tool.name === activeName} onClick={() => setSelected(tool.name)} sx={{ borderRadius: 1, mb: 0.5 }}>
                  <ListItemText primary={tool.name} primaryTypographyProps={{ variant: 'body2', sx: { fontWeight: tool.name === activeName ? 600 : 400 } }} secondary={tool.description} secondaryTypographyProps={{ noWrap: true, variant: 'caption' }} />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, p: 2.5, overflow: 'auto' }}>
        {activeTool ? (
          <ToolPanel key={activeTool.name} tool={activeTool} callTool={callTool} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Select a tool to run it.
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
