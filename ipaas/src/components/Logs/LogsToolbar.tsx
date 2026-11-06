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

import { Badge, Box, Button, Chip, IconButton, MenuItem, Select, Tooltip, TextField } from '@wso2/oxygen-ui';
import { Clock, Download, ListFilter, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX, type ReactNode } from 'react';
import type { LogsFiltersState } from '../../hooks/useLogsFilters';
import type { GatewayLogEndpoint, LogRow, LogSourceFilter } from '../../types/logs';
import { TIME_PRESETS, downloadLogs, toLocalInput } from '../../utils/logs';
import { describeAppliedFilters, type AppliedFilter } from '../../utils/logsView';
import SearchField from '../SearchField';
import LogsFilterMenu from './LogsFilterMenu';
import { appliedRowSx, customRangeSx, refreshIconSx, searchFieldSx, sourceSelectSx, timeSelectSx, toolbarRowSx, toolbarSx, toolButtonSx } from './LogsToolbar.styles';

export interface LogsToolbarProps {
  filters: LogsFiltersState;
  environments: { id: string; name: string }[];
  endpoints?: Pick<GatewayLogEndpoint, 'id' | 'displayName'>[];
  /** The rows the Download button saves. */
  logs: LogRow[];
  /** False until a query can be built, which disables Refresh. */
  canRefresh: boolean;
  /** Re-runs the queries with the filters as they are; Refresh spins until what it returns settles. */
  onRefetch: () => unknown;
  /** Adds the application/gateway selector, for views that merge both streams. */
  sourceControls?: boolean;
  /** Page-specific selectors, placed after the time range (e.g. the project page's integration picker). */
  extraFilters?: ReactNode;
  /** Adds the gateway health-check option, for views that show gateway lines. */
  gatewayControls?: boolean;
}

/** Search, filters, time range and actions for a logs view, with the applied filters as chips below. */
export default function LogsToolbar({ filters, environments, endpoints = [], logs, canRefresh, onRefetch, sourceControls = false, extraFilters, gatewayControls = false }: LogsToolbarProps): JSX.Element {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await onRefetch();
    } finally {
      setRefreshing(false);
    }
  };
  const { searchPhrase, setSearchPhrase, timePreset, setTimePreset, customStart, setCustomStart, customEnd, setCustomEnd } = filters;

  const applied = useMemo(
    () =>
      describeAppliedFilters({
        levels: filters.levelFilter,
        environments: filters.envFilter,
        endpoints: filters.endpointFilter,
        hideHealthChecks: gatewayControls && filters.hideHealthChecks,
        environmentNames: Object.fromEntries(environments.map((e) => [e.id, e.name])),
        endpointNames: Object.fromEntries(endpoints.map((e) => [e.id, e.displayName])),
      }),
    [filters.levelFilter, filters.envFilter, filters.endpointFilter, filters.hideHealthChecks, environments, endpoints, gatewayControls],
  );

  const remove = (chip: AppliedFilter): void => {
    const without = (list: string[]) => list.filter((v) => v !== chip.value);
    if (chip.field === 'level') filters.setLevelFilter(without(filters.levelFilter));
    else if (chip.field === 'environment') filters.setEnvFilter(without(filters.envFilter));
    else if (chip.field === 'endpoint') filters.setEndpointFilter(without(filters.endpointFilter));
    else filters.setHideHealthChecks(false);
  };

  return (
    <Box sx={toolbarSx}>
      <Box sx={toolbarRowSx}>
        <SearchField value={searchPhrase} onChange={setSearchPhrase} placeholder="Search logs" sx={searchFieldSx} />
        <Badge badgeContent={applied.length} color="primary" invisible={applied.length === 0}>
          <Button variant="outlined" startIcon={<ListFilter size={16} />} onClick={(e) => setMenuAnchor(e.currentTarget)} aria-haspopup="dialog" aria-expanded={!!menuAnchor} sx={toolButtonSx}>
            Filters
          </Button>
        </Badge>
        <Select
          value={timePreset || 'Past 30 days'}
          onChange={(e) => {
            const v = e.target.value as string;
            setTimePreset(v);
            if (v === 'custom') {
              setCustomEnd(toLocalInput(new Date()));
              setCustomStart(toLocalInput(new Date(Date.now() - 24 * 3600_000)));
            }
          }}
          size="small"
          startAdornment={<Clock size={16} />}
          sx={timeSelectSx}
          inputProps={{ 'aria-label': 'Time range' }}>
          {TIME_PRESETS.map((p) => (
            <MenuItem key={p.label} value={p.label}>
              {p.label}
            </MenuItem>
          ))}
          <MenuItem value="custom">Custom range</MenuItem>
        </Select>
        {extraFilters}
        {sourceControls ? (
          <Select value={filters.sourceFilter} onChange={(e) => filters.setSourceFilter(e.target.value as LogSourceFilter)} size="small" sx={sourceSelectSx} inputProps={{ 'aria-label': 'Log source' }}>
            <MenuItem value="all">All logs</MenuItem>
            <MenuItem value="component">Application logs</MenuItem>
            <MenuItem value="gateway">Gateway logs</MenuItem>
          </Select>
        ) : null}
        <Tooltip title={refreshing ? 'Refreshing…' : 'Refresh'}>
          <span>
            <IconButton aria-label={refreshing ? 'Refreshing logs' : 'Refresh logs'} aria-busy={refreshing} onClick={() => void refresh()} disabled={!canRefresh || refreshing} sx={toolButtonSx}>
              <Box component="span" sx={refreshIconSx(refreshing)}>
                <RefreshCw size={17} />
              </Box>
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Download the lines on screen">
          <span>
            <IconButton aria-label="Download logs" onClick={() => downloadLogs(logs)} disabled={logs.length === 0} sx={toolButtonSx}>
              <Download size={17} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {timePreset === 'custom' ? (
        <Box sx={customRangeSx}>
          <TextField labelPlacement="top" type="datetime-local" size="small" label="From" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          <TextField labelPlacement="top" type="datetime-local" size="small" label="To" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          <Button variant="contained" size="small" onClick={() => void refresh()}>
            Apply
          </Button>
        </Box>
      ) : null}

      {applied.length > 0 ? (
        <Box sx={appliedRowSx}>
          {applied.map((chip) => (
            <Chip key={chip.id} label={chip.label} size="small" onDelete={() => remove(chip)} />
          ))}
          <Button size="small" onClick={filters.clearFilters}>
            Clear all
          </Button>
        </Box>
      ) : null}

      <LogsFilterMenu anchorEl={menuAnchor} onClose={() => setMenuAnchor(null)} filters={filters} environments={environments} endpoints={endpoints} gatewayControls={gatewayControls} />
    </Box>
  );
}
