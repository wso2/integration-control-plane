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

import { Box, Button, CircularProgress, IconButton, InputAdornment, MenuItem, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../common/TextField';
import { Copy, Eye, EyeOff, Plug, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import type { McpConnectionStatus, McpSwitcher } from '../../types/mcp';

interface ConnectionSidebarProps {
  url: string;
  token: string;
  status: McpConnectionStatus;
  isTokenFetching?: boolean;
  endpointSwitcher?: McpSwitcher;
  onConnect: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  onGetTestKey?: () => void;
  /** `sidebar` (default) stacks the controls in a column; `bar` lays them out in one row above the panel. */
  layout?: 'sidebar' | 'bar';
}

const STATUS_META: Record<McpConnectionStatus, { label: string; color: string }> = {
  disconnected: { label: 'Disconnected', color: 'text.disabled' },
  connecting: { label: 'Connecting…', color: 'info.main' },
  connected: { label: 'Connected', color: 'success.main' },
  error: { label: 'Error', color: 'error.main' },
};

const readOnlyInputSx = { bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: 12.5 } as const;
const sidebarSx = { width: 300, flexShrink: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2.5, alignSelf: 'flex-start' } as const;
const barSx = { width: '100%', flexWrap: 'wrap', alignItems: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 } as const;

/** The playground's left panel: the endpoint selector, the derived URL + test key, and connect controls. */
export default function ConnectionSidebar({ url, token, status, isTokenFetching, endpointSwitcher, onConnect, onDisconnect, onReconnect, onGetTestKey, layout = 'sidebar' }: ConnectionSidebarProps): JSX.Element {
  const bar = layout === 'bar';
  const [showToken, setShowToken] = useState(false);
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const meta = STATUS_META[status];
  const copy = (value: string) => void navigator.clipboard?.writeText(value).catch(() => undefined);

  return (
    <Stack direction={bar ? 'row' : 'column'} gap={bar ? 1.5 : 2} sx={bar ? barSx : sidebarSx}>
      {endpointSwitcher && (
        <Tooltip title={connected || connecting ? 'Disconnect to select a different endpoint.' : ''}>
          <Box component="span" sx={{ display: 'block' }}>
            <TextField select label="Endpoint" size="small" fullWidth value={endpointSwitcher.value} onChange={(e) => endpointSwitcher.onChange(e.target.value)} disabled={connected || connecting}>
              {endpointSwitcher.options.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Tooltip>
      )}

      <TextField
        label="URL"
        size="small"
        fullWidth={!bar}
        sx={bar ? { flex: '3 1 320px' } : undefined}
        value={url}
        InputProps={{
          readOnly: true,
          sx: readOnlyInputSx,
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title="Copy URL">
                <IconButton size="small" aria-label="Copy URL" onClick={() => copy(url)} edge="end">
                  <Copy size={14} />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />

      <TextField
        label="Token"
        size="small"
        fullWidth={!bar}
        sx={bar ? { flex: '1 1 200px' } : undefined}
        type={showToken ? 'text' : 'password'}
        value={token}
        InputProps={{
          readOnly: true,
          sx: readOnlyInputSx,
          endAdornment: (
            <InputAdornment position="end">
              {isTokenFetching && <CircularProgress size={14} sx={{ mr: 0.5 }} />}
              <IconButton size="small" aria-label={showToken ? 'Hide token' : 'Show token'} onClick={() => setShowToken((s) => !s)} edge="end">
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </IconButton>
              <Tooltip title="Copy token">
                <IconButton size="small" aria-label="Copy token" onClick={() => copy(token)} edge="end">
                  <Copy size={14} />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />

      {onGetTestKey && (
        <Button variant="outlined" size="small" onClick={onGetTestKey} disabled={isTokenFetching}>
          Get Test Key
        </Button>
      )}

      {connected ? (
        <Stack direction="row" gap={1}>
          <Button variant="outlined" size="small" fullWidth={!bar} startIcon={<RefreshCw size={14} />} onClick={onReconnect}>
            Reconnect
          </Button>
          <Button variant="outlined" size="small" fullWidth={!bar} color="error" onClick={onDisconnect}>
            Disconnect
          </Button>
        </Stack>
      ) : (
        <Button variant="contained" size="small" startIcon={connecting ? <CircularProgress size={14} color="inherit" /> : <Plug size={14} />} onClick={onConnect} disabled={connecting || !url || !token}>
          {connecting ? 'Connecting…' : 'Connect'}
        </Button>
      )}

      <Stack direction="row" alignItems="center" gap={1}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: meta.color }} />
        <Typography variant="caption" color="text.secondary">
          {meta.label}
        </Typography>
      </Stack>
    </Stack>
  );
}
