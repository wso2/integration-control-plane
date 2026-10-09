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

import { Button, Checkbox, IconButton, ListItemText, MenuItem, Select, Stack, Tooltip } from '@wso2/oxygen-ui';
import { Download, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import SearchField from '../../../components/SearchField';
import { AUDIT_LOG_OUTCOMES, AUDIT_TIME_PRESETS } from '../../constants/auditLogs';
import type { AuditLogOutcome, AuditLogSort } from '../../../types/auditLogs';

export interface AuditLogsFiltersProps {
  outcomes: AuditLogOutcome[];
  setOutcomes: (v: AuditLogOutcome[]) => void;
  projects: { id: string; name: string }[];
  projectIds: string[];
  setProjectIds: (v: string[]) => void;
  presetId: string;
  setPresetId: (v: string) => void;
  sort: AuditLogSort;
  setSort: (v: AuditLogSort) => void;
  search: string;
  setSearch: (v: string) => void;
  onRefresh: () => void;
  onDownload: () => void;
  downloadDisabled: boolean;
}

/** Audit-logs filter toolbar — mirrors the runtime Logs filter styling (dropdowns + search + actions). */
export default function AuditLogsFilters(props: AuditLogsFiltersProps): JSX.Element {
  const { outcomes, setOutcomes, projects, projectIds, setProjectIds, presetId, setPresetId, sort, setSort, search, setSearch, onRefresh, onDownload, downloadDisabled } = props;

  return (
    <Stack direction="row" gap={1.5} sx={{ mb: 1.5 }} flexWrap="wrap" alignItems="center">
      {/* Outcome */}
      <Select
        multiple
        value={outcomes}
        onChange={(e) => setOutcomes(typeof e.target.value === 'string' ? (e.target.value.split(',') as AuditLogOutcome[]) : (e.target.value as AuditLogOutcome[]))}
        displayEmpty
        renderValue={(sel) => ((sel as string[]).length === 0 ? 'All outcomes' : (sel as string[]).map((v) => AUDIT_LOG_OUTCOMES.find((o) => o.value === v)?.label ?? v).join(', '))}
        size="small"
        sx={{ minWidth: 150 }}
        inputProps={{ 'aria-label': 'Outcome' }}>
        {AUDIT_LOG_OUTCOMES.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            <Checkbox checked={outcomes.includes(o.value)} size="small" sx={{ p: 0, mr: 1 }} />
            <ListItemText primary={o.label} />
          </MenuItem>
        ))}
      </Select>

      {/* Project */}
      <Select
        multiple
        value={projectIds}
        onChange={(e) => setProjectIds(typeof e.target.value === 'string' ? e.target.value.split(',') : (e.target.value as string[]))}
        displayEmpty
        renderValue={(sel) => ((sel as string[]).length === 0 ? 'All projects' : `${(sel as string[]).length} selected`)}
        size="small"
        sx={{ minWidth: 150 }}
        inputProps={{ 'aria-label': 'Project' }}>
        {projects.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            <Checkbox checked={projectIds.includes(p.id)} size="small" sx={{ p: 0, mr: 1 }} />
            <ListItemText primary={p.name} />
          </MenuItem>
        ))}
      </Select>

      {/* Time range */}
      <Select value={presetId} onChange={(e) => setPresetId(e.target.value)} size="small" sx={{ minWidth: 160 }} inputProps={{ 'aria-label': 'Time range' }}>
        {AUDIT_TIME_PRESETS.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.label}
          </MenuItem>
        ))}
      </Select>

      {/* Sort */}
      <Select value={sort} onChange={(e) => setSort(e.target.value as AuditLogSort)} size="small" sx={{ minWidth: 130 }} inputProps={{ 'aria-label': 'Sort direction' }}>
        <MenuItem value="desc">Newest first</MenuItem>
        <MenuItem value="asc">Oldest first</MenuItem>
      </Select>

      {/* Search */}
      <SearchField value={search} onChange={setSearch} placeholder="Search audit logs..." sx={{ minWidth: 200, flex: 1 }} />

      {/* Download */}
      <Tooltip title="Download logs">
        <span>
          <IconButton size="small" aria-label="Download audit logs" onClick={onDownload} disabled={downloadDisabled}>
            <Download size={18} />
          </IconButton>
        </span>
      </Tooltip>

      {/* Refresh */}
      <Button variant="outlined" size="small" onClick={onRefresh} startIcon={<RefreshCw size={14} />}>
        Refresh
      </Button>
    </Stack>
  );
}
