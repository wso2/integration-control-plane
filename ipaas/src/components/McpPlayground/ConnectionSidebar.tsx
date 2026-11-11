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

import { Box, Button, CircularProgress, IconButton, InputAdornment, MenuItem, Stack, Tooltip, Typography, TextField } from '@wso2/oxygen-ui';
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
  /**
   * The page connects through ipaas-service's relay, which holds a key of its own, so connecting needs no
   * token. A token field is still shown when `onGetTestKey` is given: it is for calling the URL from
   * another MCP client.
   */
  keyless?: boolean;
  /** The endpoint's visibility, shown read-only. */
  visibility?: string;
}

const STATUS_META: Record<McpConnectionStatus, { label: string; color: string }> = {
  disconnected: { label: 'Disconnected', color: 'text.disabled' },
  connecting: { label: 'Connecting…', color: 'info.main' },
  connected: { label: 'Connected', color: 'success.main' },
  error: { label: 'Error', color: 'error.main' },
};

const readOnlyInputSx = { bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: 12.5 } as const;

/** The playground's left panel: the endpoint selector, the derived URL + test key, and connect controls. */
export default function ConnectionSidebar({ url, token, status, isTokenFetching, endpointSwitcher, onConnect, onDisconnect, onReconnect, onGetTestKey, keyless = false, visibility }: ConnectionSidebarProps): JSX.Element {
  const [showToken, setShowToken] = useState(false);
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const meta = STATUS_META[status];
  const copy = (value: string) => void navigator.clipboard?.writeText(value).catch(() => undefined);

  return (
    <Stack gap={2} sx={{ width: 300, flexShrink: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2.5, alignSelf: 'flex-start' }}>
      {endpointSwitcher && (
        <Tooltip title={connected || connecting ? 'Disconnect to select a different endpoint.' : ''}>
          <Box component="span" sx={{ display: 'block' }}>
            <TextField labelPlacement="top" select label="Endpoint" size="small" fullWidth value={endpointSwitcher.value} onChange={(e) => endpointSwitcher.onChange(e.target.value)} disabled={connected || connecting}>
              {endpointSwitcher.options.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Tooltip>
      )}

      {visibility && <TextField labelPlacement="top" label="Visibility" size="small" fullWidth value={visibility} InputProps={{ readOnly: true, sx: readOnlyInputSx }} />}

      <TextField
        labelPlacement="top"
        label="URL"
        size="small"
        fullWidth
        value={url}
        // The AI gateway gives the URL only once it has published the server; the relay calls it too.
        placeholder={keyless ? 'Not published on the AI gateway yet' : undefined}
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

      {(!keyless || onGetTestKey) && (
        <TextField
          labelPlacement="top"
          label="Token"
          size="small"
          fullWidth
          type={showToken ? 'text' : 'password'}
          value={token}
          placeholder={keyless ? 'Get a test key to call this URL yourself' : undefined}
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
                  {/* A disabled button fires no events, so the tooltip listens on its wrapper. */}
                  <Box component="span">
                    <IconButton size="small" aria-label="Copy token" onClick={() => copy(token)} edge="end" disabled={!token}>
                      <Copy size={14} />
                    </IconButton>
                  </Box>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
      )}

      {onGetTestKey && (
        <Button variant="outlined" size="small" onClick={onGetTestKey} disabled={isTokenFetching}>
          Get test key
        </Button>
      )}

      {connected ? (
        <Stack direction="row" gap={1}>
          <Button variant="outlined" size="small" fullWidth startIcon={<RefreshCw size={14} />} onClick={onReconnect}>
            Reconnect
          </Button>
          <Button variant="outlined" size="small" fullWidth color="error" onClick={onDisconnect}>
            Disconnect
          </Button>
        </Stack>
      ) : (
        <Button variant="contained" size="small" startIcon={connecting ? <CircularProgress size={14} color="inherit" /> : <Plug size={14} />} onClick={onConnect} disabled={connecting || !url || (!keyless && !token)}>
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
