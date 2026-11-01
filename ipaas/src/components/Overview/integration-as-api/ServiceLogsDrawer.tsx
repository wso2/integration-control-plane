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

import { Box, Button, Checkbox, DrawerPanel, FormControlLabel, IconButton, MenuItem, Select, Stack, TextField, Tooltip } from '@wso2/oxygen-ui';
import { Download, RefreshCw, X } from '@wso2/oxygen-ui-icons-react';
import { useMemo } from 'react';
import { useInfiniteComponentLogs, useVisibleLogs } from '../../../hooks/useLogs';
import type { ComponentLogsRequest } from '../../../types/logs';
import { choreologgingComponentGatewayLogsApiUrl } from '../../../config/runtimeConfig';
import { useLogsFilters } from '../../../hooks/useLogsFilters';
import { AUTO_FETCH_INTERVAL, DEFAULT_DP_REGION, LOG_LEVELS, PAGE_SIZE, TIME_PRESETS, downloadLogs } from '../../../utils/logs';
import SearchField from '../../SearchField';
import LogsPanel from '../../Logs/LogsPanel';
import LogEntry from '../../Logs/LogEntry';

function formatLocalDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface ServiceLogsDrawerProps {
  open: boolean;
  onClose: () => void;
  componentId: string;
  environmentId: string;
  envName: string;
  versionId: string;
  region?: string;
}

export default function ServiceLogsDrawer({ open, onClose, componentId, environmentId, envName, versionId, region }: ServiceLogsDrawerProps) {
  const filters = useLogsFilters();
  const { levelFilter, setLevelFilter, timePreset, setTimePreset, customStart, setCustomStart, customEnd, setCustomEnd, sortDir, setSortDir, searchPhrase, setSearchPhrase, autoFetch, setAutoFetch, startTime, endTime, clearFilters } = filters;

  const logsApiUrl = choreologgingComponentGatewayLogsApiUrl();

  const logsRequest = useMemo<ComponentLogsRequest | null>(() => {
    if (!componentId || !environmentId || !open) return null;
    return {
      componentId,
      environmentId,
      versionIdList: versionId ? [versionId] : [],
      regexPhrase: '',
      logType: 'singleLine',
      logLevels: levelFilter,
      startTime,
      endTime,
      limit: PAGE_SIZE,
      sort: sortDir,
      region: region || DEFAULT_DP_REGION,
      searchPhrase,
    };
  }, [componentId, environmentId, versionId, open, levelFilter, startTime, endTime, sortDir, region, searchPhrase]);

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteComponentLogs(logsRequest, autoFetch ? AUTO_FETCH_INTERVAL : false, logsApiUrl);

  const logs = useVisibleLogs(data, { levels: levelFilter });

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  return (
    <DrawerPanel open={open} onClose={handleClose} width={720}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>Runtime Logs</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      {/* Filters */}
      <Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
        <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center" sx={{ mb: 1 }}>
          {/* Log level filter */}
          <Select
            multiple
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as string[])}
            displayEmpty
            renderValue={(selected) => {
              const sel = selected as string[];
              return sel.length === 0 ? 'All Levels' : sel.join(', ');
            }}
            size="small"
            sx={{ minWidth: 120 }}
            inputProps={{ 'aria-label': 'Log level' }}>
            {LOG_LEVELS.map((l) => (
              <MenuItem key={l} value={l}>
                {l}
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
                  setCustomEnd(formatLocalDatetime(new Date()));
                  setCustomStart(formatLocalDatetime(new Date(Date.now() - 24 * 3600_000)));
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
          <SearchField value={searchPhrase} onChange={setSearchPhrase} placeholder="Search logs..." sx={{ minWidth: 180, flex: 1 }} />

          {/* Auto fetch */}
          <FormControlLabel control={<Checkbox checked={autoFetch} onChange={(_, c) => setAutoFetch(c)} size="small" />} label="Auto Fetch" sx={{ mr: 0, whiteSpace: 'nowrap' }} slotProps={{ typography: { variant: 'body2' } }} />

          {/* Download */}
          <Tooltip title="Download logs">
            <IconButton size="small" aria-label="Download logs" onClick={() => downloadLogs(logs)} disabled={logs.length === 0}>
              <Download size={18} />
            </IconButton>
          </Tooltip>

          {/* Refresh */}
          <Button variant="outlined" size="small" onClick={() => refetch()} disabled={!logsRequest} startIcon={<RefreshCw size={14} />}>
            Refresh
          </Button>
        </Stack>

        {/* Custom date range */}
        {timePreset === 'custom' && (
          <Stack direction="row" gap={1.5} sx={{ mb: 1 }} flexWrap="wrap" alignItems="center">
            <TextField labelPlacement="top" type="datetime-local" size="small" label="Start" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <TextField labelPlacement="top" type="datetime-local" size="small" label="End" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            <Button variant="contained" size="small" onClick={() => refetch()}>
              Apply
            </Button>
          </Stack>
        )}
      </Box>

      {/* Log content */}
      <DrawerPanel.Body sx={{ overflow: 'hidden', pt: 0 }}>
        <LogsPanel
          items={logs}
          getKey={(l, i) => `${i}-${l.timestamp}-${l.logLine.slice(0, 50)}`}
          renderRow={(l, ex, tg) => <LogEntry log={l} expanded={ex} onToggle={tg} envName={envName} />}
          isLoading={isLoading}
          error={error}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onRefetch={refetch}
          onFetchNextPage={fetchNextPage}
          onClearFilters={clearFilters}
        />
      </DrawerPanel.Body>
    </DrawerPanel>
  );
}
