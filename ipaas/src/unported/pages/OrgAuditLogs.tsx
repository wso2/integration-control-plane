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

import { useEffect, useMemo, useState, type JSX } from 'react';
import { useAuditLogs } from '../hooks/useAuditLogs';
import { useProjects } from '../../hooks/useProjects';
import { AUDIT_LOG_LIMIT, AUDIT_TIME_PRESETS, DEFAULT_AUDIT_TIME_PRESET } from '../constants/auditLogs';
import { downloadAuditLogs, rangeFromPreset } from '../utils/auditLogs';
import LogsPageLayout from '../../components/Logs/LogsPageLayout';
import LogsPanel from '../../components/Logs/LogsPanel';
import AuditLogsFilters from '../components/AuditLogs/AuditLogsFilters';
import AuditLogRow from '../components/AuditLogs/AuditLogRow';
import type { AuditLogEntry, AuditLogOutcome, AuditLogsRequest, AuditLogSort } from '../../types/auditLogs';

export default function OrgAuditLogs(): JSX.Element {
  const [presetId, setPresetId] = useState(DEFAULT_AUDIT_TIME_PRESET);
  const [refreshKey, setRefreshKey] = useState(0);
  const [outcomes, setOutcomes] = useState<AuditLogOutcome[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [sort, setSort] = useState<AuditLogSort>('desc');

  const { data: projects } = useProjects();

  // Debounce the free-text search so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(searchInput.trim()), 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Resolve the look-back window to concrete ISO bounds; recomputed on preset change or refresh.
  const range = useMemo(() => {
    const preset = AUDIT_TIME_PRESETS.find((p) => p.id === presetId) ?? AUDIT_TIME_PRESETS.find((p) => p.id === DEFAULT_AUDIT_TIME_PRESET) ?? AUDIT_TIME_PRESETS[0];
    return rangeFromPreset(preset.ms, Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, refreshKey]);

  const request = useMemo<AuditLogsRequest>(() => ({ outcomes, searchText: appliedSearch, userIdpIds: [], projectIds, startTime: range.startTime, endTime: range.endTime, limit: AUDIT_LOG_LIMIT, sort }), [outcomes, appliedSearch, projectIds, range, sort]);

  const { data: logs = [], isLoading, error } = useAuditLogs(request);

  const refresh = () => setRefreshKey((k) => k + 1);
  const clearFilters = () => {
    setOutcomes([]);
    setProjectIds([]);
    setSearchInput('');
    setPresetId(DEFAULT_AUDIT_TIME_PRESET);
  };

  return (
    <LogsPageLayout
      title="Audit Logs"
      filtersElement={
        <AuditLogsFilters
          outcomes={outcomes}
          setOutcomes={setOutcomes}
          projects={projects ?? []}
          projectIds={projectIds}
          setProjectIds={setProjectIds}
          presetId={presetId}
          setPresetId={setPresetId}
          sort={sort}
          setSort={setSort}
          search={searchInput}
          setSearch={setSearchInput}
          onRefresh={refresh}
          onDownload={() => downloadAuditLogs(logs)}
          downloadDisabled={logs.length === 0}
        />
      }
      logPanelElement={
        <LogsPanel<AuditLogEntry>
          items={logs}
          getKey={(entry, i) => `${i}-${entry.timestamp}-${entry.action ?? entry.message ?? ''}`}
          renderRow={(entry, expanded, toggle) => <AuditLogRow entry={entry} expanded={expanded} onToggle={toggle} />}
          isLoading={isLoading}
          error={error}
          onRefetch={refresh}
          onClearFilters={clearFilters}
          emptyTitle="No audit events found"
          emptyDescription="No audit events matched your filters for the selected time range. Try widening the time range, clearing some filters, or refreshing."
          errorTitle="Couldn't load audit logs"
          errorDescription="The audit logging service is temporarily unavailable. Please try again in a moment."
        />
      }
    />
  );
}
