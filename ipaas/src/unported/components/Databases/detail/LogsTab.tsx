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

import { Box, MenuItem, Stack } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useFetchServerLogs } from '../../../hooks/usePlatformServices';
import { LOG_TIME_RANGES } from '../../../../constants/platformServices';
import { logOffsetNs } from '../../../utils/platformServices';
import LogsPanel from '../../../../components/Logs/LogsPanel';
import DbLogRow from './DbLogRow';
import type { LogEntry, ServerVariant } from '../../../../types/platformServices';

const PAGE_SIZE = 100;

export default function LogsTab({ serverId, variant = 'db-servers' }: { serverId: string; variant?: ServerVariant }): JSX.Element {
  const fetchLogs = useFetchServerLogs(serverId, variant);
  const [rangeMinutes, setRangeMinutes] = useState(60);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [startMs, setStartMs] = useState(0);
  const [floorNs, setFloorNs] = useState('0');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [error, setError] = useState(false);
  // Guards against a stale fetch (e.g. a slow previous range) overwriting newer state.
  const reqIdRef = useRef(0);

  // A full page whose older cursor is still within the window (BigInt: offsets exceed MAX_SAFE_INTEGER).
  const stillMore = (batch: LogEntry[], within: LogEntry[], nextOffset: string, floor: string) => batch.length === PAGE_SIZE && within.length === batch.length && BigInt(nextOffset) > BigInt(floor);

  const loadWindow = useCallback(
    async (minutes: number) => {
      const token = ++reqIdRef.current;
      setLoading(true);
      setError(false);
      const now = Date.now();
      const start = now - minutes * 60 * 1000;
      const floor = logOffsetNs(start);
      setStartMs(start);
      setFloorNs(floor);
      try {
        const res = await fetchLogs({ offset: logOffsetNs(now), limit: PAGE_SIZE, sort_order: 'desc' });
        if (token !== reqIdRef.current) return;
        const within = res.logs.filter((l) => new Date(l.time).getTime() >= start);
        setLogs(within);
        setCursor(res.offset);
        setHasMore(stillMore(res.logs, within, res.offset, floor));
      } catch {
        if (token === reqIdRef.current) setError(true);
      } finally {
        if (token === reqIdRef.current) setLoading(false);
      }
    },
    [fetchLogs],
  );

  const loadOlder = useCallback(async () => {
    if (!cursor) return;
    const token = reqIdRef.current;
    setFetchingMore(true);
    setError(false);
    try {
      const res = await fetchLogs({ offset: cursor, limit: PAGE_SIZE, sort_order: 'desc' });
      if (token !== reqIdRef.current) return;
      const within = res.logs.filter((l) => new Date(l.time).getTime() >= startMs);
      setLogs((prev) => [...prev, ...within]);
      setCursor(res.offset);
      setHasMore(stillMore(res.logs, within, res.offset, floorNs));
    } catch {
      if (token === reqIdRef.current) setError(true);
    } finally {
      if (token === reqIdRef.current) setFetchingMore(false);
    }
  }, [fetchLogs, cursor, startMs, floorNs]);

  useEffect(() => {
    loadWindow(rangeMinutes);
  }, [loadWindow, rangeMinutes]);

  const selectedLabel = LOG_TIME_RANGES.find((r) => r.minutes === rangeMinutes)?.label ?? '';

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <TextField select size="small" label="Time range" value={rangeMinutes} onChange={(e) => setRangeMinutes(Number(e.target.value))} sx={{ minWidth: 180 }}>
          {LOG_TIME_RANGES.map((r) => (
            <MenuItem key={r.minutes} value={r.minutes}>
              {r.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <LogsPanel<LogEntry>
        items={logs}
        isLoading={loading}
        error={error && logs.length === 0 ? new Error('logs') : null}
        getKey={(l, i) => `${i}-${l.time}-${l.msg.slice(0, 50)}`}
        renderRow={(l, expanded, toggle) => <DbLogRow log={l} expanded={expanded} onToggle={toggle} />}
        onRefetch={() => loadWindow(rangeMinutes)}
        hasNextPage={hasMore}
        isFetchingNextPage={fetchingMore}
        onFetchNextPage={loadOlder}
        emptyTitle="No logs found"
        emptyDescription={`No log entries in the ${selectedLabel.toLowerCase()}. Try a wider time range or refreshing in a moment.`}
        errorTitle="Couldn't load logs"
        errorDescription="The logging service is temporarily unavailable. Please try again in a moment."
      />
    </Box>
  );
}
