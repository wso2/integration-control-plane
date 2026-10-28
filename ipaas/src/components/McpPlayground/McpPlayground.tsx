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

import { Box, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { Plug } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useState, type JSX, type MouseEvent } from 'react';
import { useMcpConnection } from '../../hooks/useMcpConnection';
import ConnectionAlert from './ConnectionAlert';
import ConnectionSidebar from './ConnectionSidebar';
import HistoryPanel from './HistoryPanel';
import PingTab from './PingTab';
import ToolsTab from './ToolsTab';
import type { McpSwitcher, McpTool } from '../../types/mcp';

type PlaygroundTab = 'tools' | 'ping';

const MIN_HISTORY_HEIGHT = 120;
const MAX_HISTORY_HEIGHT = 480;

const mainPanelSx = { flex: 1, minWidth: 0, minHeight: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' } as const;
const resizeHandleSx = { height: 6, flexShrink: 0, cursor: 'row-resize', bgcolor: 'divider', '&:hover': { bgcolor: 'primary.main' }, transition: 'background-color 0.15s' } as const;

interface McpPlaygroundProps {
  /** The MCP endpoint (e.g. `${publicUrl}/mcp`). */
  url: string;
  /** Auth token sent in the `headerName` header. */
  token: string | null;
  /** Header carrying the token (default `test-key`). */
  headerName?: string;
  /** Shows a loading state on the token field while it is being minted. */
  isTokenFetching?: boolean;
  /** Mint a fresh token ("Get Test Key"). */
  onTokenRegenerate?: () => void;
  /** Endpoint chooser rendered in the sidebar. */
  endpointSwitcher?: McpSwitcher;
  /** Where the connection controls go: a `sidebar` beside the panel (default) or a `bar` above it. */
  connectionLayout?: 'sidebar' | 'bar';
}

/**
 * In-house MCP playground: a connection sidebar (endpoint/URL/token) plus a
 * Tools tab (list → schema-driven form → run → result), a Ping tab, and a resizable
 * activity-history panel — all over the `useMcpConnection` session.
 */
export default function McpPlayground({ url, token, headerName = 'test-key', isTokenFetching, onTokenRegenerate, endpointSwitcher, connectionLayout = 'sidebar' }: McpPlaygroundProps): JSX.Element {
  const conn = useMcpConnection({ url, token, headerName });
  const { status, listTools } = conn;

  const [tab, setTab] = useState<PlaygroundTab>('tools');
  const [tools, setTools] = useState<McpTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [historyHeight, setHistoryHeight] = useState(140);

  const refreshTools = useCallback(() => {
    setToolsLoading(true);
    listTools()
      .then(setTools)
      .catch(() => setTools([]))
      .finally(() => setToolsLoading(false));
  }, [listTools]);

  // List tools once connected; clear them when the connection drops.
  useEffect(() => {
    if (status !== 'connected') {
      setTools([]);
      return;
    }
    refreshTools();
  }, [status, refreshTools]);

  const reconnect = async () => {
    await conn.disconnect();
    await conn.connect();
  };

  // Drag the handle to grow/shrink the history panel (upwards grows it).
  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = historyHeight;
    const onMove = (ev: globalThis.MouseEvent) => setHistoryHeight(Math.min(Math.max(startHeight + (startY - ev.clientY), MIN_HISTORY_HEIGHT), MAX_HISTORY_HEIGHT));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <Stack gap={1.5} sx={{ height: '100%', minHeight: 0 }}>
      <ConnectionAlert error={conn.error} errorKind={conn.errorKind} isTokenFetching={isTokenFetching} onGetTestKey={onTokenRegenerate} />

      <Stack direction={connectionLayout === 'bar' ? 'column' : 'row'} gap={connectionLayout === 'bar' ? 1.5 : 2} sx={{ flex: 1, minHeight: 0 }}>
        <ConnectionSidebar
          layout={connectionLayout}
          url={url}
          token={token ?? ''}
          status={conn.status}
          isTokenFetching={isTokenFetching}
          endpointSwitcher={endpointSwitcher}
          onConnect={() => void conn.connect()}
          onDisconnect={() => void conn.disconnect()}
          onReconnect={() => void reconnect()}
          onGetTestKey={onTokenRegenerate}
        />

        <Stack sx={mainPanelSx}>
          {status !== 'connected' ? (
            <Stack alignItems="center" justifyContent="center" gap={1.5} sx={{ flex: 1, p: 3 }}>
              <Plug size={36} style={{ opacity: 0.3 }} />
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                Connect to an MCP server to start inspecting.
              </Typography>
            </Stack>
          ) : (
            <>
              <Tabs value={tab} onChange={(_, v) => setTab(v as PlaygroundTab)} sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 2, minHeight: 40 }}>
                <Tab value="tools" label="Tools" sx={{ minHeight: 40 }} />
                <Tab value="ping" label="Ping" sx={{ minHeight: 40 }} />
              </Tabs>

              <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{tab === 'tools' ? <ToolsTab tools={tools} loading={toolsLoading} callTool={conn.callTool} onRefresh={refreshTools} /> : <PingTab ping={conn.ping} />}</Box>

              <Box role="separator" aria-label="Resize activity history" onMouseDown={startResize} sx={resizeHandleSx} />
              <Box sx={{ height: historyHeight, flexShrink: 0 }}>
                <HistoryPanel history={conn.history} onClear={conn.clearHistory} />
              </Box>
            </>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
