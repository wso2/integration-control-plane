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

import { Button, Checkbox, FormControlLabel, IconButton, ListItemText, MenuItem, Select, Stack, TextField, Tooltip } from '@wso2/oxygen-ui';
import { Download, RefreshCw, X } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { ComponentLogsRequest, LogRow, LogsRequest } from '../../types/logs';
import SearchField from '../SearchField';
import type { LogsFiltersState } from '../../hooks/useLogsFilters';
import { LOG_LEVELS, TIME_PRESETS, downloadLogs } from '../../utils/logs';

export interface LogsFiltersProps {
  /** All filter state from useLogsFilters() */
  filters: LogsFiltersState;
  /** Available environments to populate the environment dropdown */
  environments: { id: string; name: string }[];
  /** Current fetched logs — used for the download button */
  logs: LogRow[];
  /** Disables the Refresh button until a valid request can be built */
  logsRequest: LogsRequest | ComponentLogsRequest | null;
  onRefetch: () => void;
}

export default function LogsFilters({ filters, environments, logs, logsRequest, onRefetch }: LogsFiltersProps): JSX.Element {
  const { envFilter, setEnvFilter, levelFilter, setLevelFilter, timePreset, setTimePreset, customStart, setCustomStart, customEnd, setCustomEnd, sortDir, setSortDir, searchPhrase, setSearchPhrase, autoFetch, setAutoFetch } = filters;

  return (
    <>
      {/* Filter toolbar */}
      <Stack direction="row" gap={1.5} sx={{ mb: 1 }} flexWrap="wrap" alignItems="center">
        {/* Environment filter — nothing to narrow when there is one environment. */}
        {environments.length > 1 && (
          <Select
            multiple
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value as string[])}
            displayEmpty
            renderValue={(selected) => {
              const sel = selected as string[];
              if (sel.length === 0) return 'All Environments';
              return environments
                .filter((env) => sel.includes(env.id))
                .map((env) => env.name)
                .join(', ');
            }}
            size="small"
            sx={{ minWidth: 160 }}
            inputProps={{ 'aria-label': 'Environment' }}>
            {environments.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                <Checkbox checked={envFilter.includes(e.id)} size="small" sx={{ p: 0, mr: 1 }} />
                <ListItemText primary={e.name} />
              </MenuItem>
            ))}
          </Select>
        )}

        {/* Log level filter */}
        <Select
          multiple
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as string[])}
          displayEmpty
          renderValue={(selected) => {
            const sel = selected as string[];
            if (sel.length === 0) return 'All Levels';
            return sel.join(', ');
          }}
          size="small"
          sx={{ minWidth: 120 }}
          inputProps={{ 'aria-label': 'Log level' }}>
          {LOG_LEVELS.map((l) => (
            <MenuItem key={l} value={l}>
              <Checkbox checked={levelFilter.includes(l)} size="small" sx={{ p: 0, mr: 1 }} />
              <ListItemText primary={l} />
            </MenuItem>
          ))}
        </Select>

        {/* Time range */}
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Select
            value={timePreset}
            onChange={(e) => {
              const v = e.target.value as string;
              setTimePreset(v);
              if (v === 'custom') {
                setCustomEnd(new Date().toISOString().slice(0, 16));
                setCustomStart(new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 16));
              }
            }}
            size="small"
            sx={{ minWidth: 160 }}
            inputProps={{ 'aria-label': 'Time range' }}>
            {TIME_PRESETS.map((p) => (
              <MenuItem key={p.label} value={p.label}>
                {p.label}
              </MenuItem>
            ))}
            <MenuItem value="custom">Custom</MenuItem>
          </Select>
          {timePreset !== '' && (
            <Tooltip title="Clear time filter (defaults to 30 days)">
              <IconButton size="small" onClick={() => setTimePreset('')}>
                <X size={14} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        {/* Sort direction */}
        <Select value={sortDir} onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')} size="small" sx={{ minWidth: 120 }} inputProps={{ 'aria-label': 'Sort direction' }}>
          <MenuItem value="desc">Newest first</MenuItem>
          <MenuItem value="asc">Oldest first</MenuItem>
        </Select>

        {/* Search */}
        <SearchField value={searchPhrase} onChange={setSearchPhrase} placeholder="Search logs..." sx={{ minWidth: 200, flex: 1 }} />

        {/* Auto fetch */}
        <FormControlLabel control={<Checkbox checked={autoFetch} onChange={(_, c) => setAutoFetch(c)} size="small" />} label="Auto Fetch" sx={{ mr: 0, whiteSpace: 'nowrap' }} slotProps={{ typography: { variant: 'body2' } }} />

        {/* Download */}
        <Tooltip title="Download logs">
          <IconButton size="small" aria-label="Download logs" onClick={() => downloadLogs(logs)} disabled={logs.length === 0}>
            <Download size={18} />
          </IconButton>
        </Tooltip>

        {/* Refresh */}
        <Button variant="outlined" size="small" onClick={onRefetch} disabled={!logsRequest} startIcon={<RefreshCw size={14} />}>
          Refresh
        </Button>
      </Stack>

      {/* Custom date range inputs */}
      {timePreset === 'custom' && (
        <Stack direction="row" gap={1.5} sx={{ mb: 2 }} flexWrap="wrap" alignItems="center">
          <TextField type="datetime-local" size="small" label="Start" value={customStart} onChange={(e) => setCustomStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="datetime-local" size="small" label="End" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <Button variant="contained" size="small" onClick={onRefetch}>
            Apply
          </Button>
        </Stack>
      )}
    </>
  );
}
