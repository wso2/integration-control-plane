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

import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, Link, MenuItem, OutlinedInput, Select, Stack, Switch, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../common/TextField';
import { HelpCircle, RefreshCw, Search, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import * as styles from './PodLogsDrawer.styles';
import PodDrawerShell from './PodDrawerShell';
import { POD_LOGS_TOOLTIPS, SINCE_SECONDS_DEBOUNCE_MS } from '../../constants/runtime';
import { usePodLogs } from '../../hooks/useRuntime';
import { componentUrl } from '../../paths';
import { filterLogLines } from '../../utils/logs';
import { highlightText } from '../../utils/highlight';
import { podRestartCount } from '../../utils/podMetrics';
import type { ClusterPod, PodLogOptions, PodScope } from '../../types/runtime';

interface PodLogsDrawerProps {
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  pod: ClusterPod | null;
  scope: PodScope;
}

export default function PodLogsDrawer({ open, onClose, onExited, pod, scope }: PodLogsDrawerProps): JSX.Element {
  const podName = pod?.metadata.name ?? '';
  const containers = useMemo(() => pod?.spec.containers ?? [], [pod]);

  const [containerName, setContainerName] = useState<string | undefined>();
  const [previous, setPrevious] = useState(false);
  const [sinceInput, setSinceInput] = useState('');
  const [sinceSeconds, setSinceSeconds] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState(false);

  // Follow the pod: a drawer reopened on a different pod must not keep the old container.
  useEffect(() => {
    setContainerName(containers[0]?.name);
  }, [containers]);

  useEffect(() => {
    const parsed = parseInt(sinceInput, 10);
    const timer = setTimeout(() => setSinceSeconds(Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed), SINCE_SECONDS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [sinceInput]);

  const options = useMemo<PodLogOptions>(() => ({ previous, sinceSeconds, containerName }), [previous, sinceSeconds, containerName]);
  const { data: logs = '', isLoading, isFetching, isError, error, refetch } = usePodLogs(scope.projectId, scope.componentHandler, scope.releaseId, podName, options, open);

  const lines = useMemo(() => filterLogLines(logs, search, filterMode), [logs, search, filterMode]);
  // `previous` reads the prior instance of a container, which only exists after a restart.
  const hasPreviousLogs = pod ? podRestartCount(pod) > 0 : false;
  const runtimeLogsUrl = `${componentUrl(scope.orgHandler, scope.projectHandler, scope.componentHandler)}/logs`;

  return (
    <PodDrawerShell open={open} onClose={onClose} onExited={onExited} title={`Real-Time Logs for Pod: ${podName}`}>
      <Alert severity="info" sx={styles.banner}>
        To view aggregated and historical logs from all running instances, see{' '}
        <Link component={RouterLink} to={runtimeLogsUrl} onClick={onClose}>
          Runtime Logs.
        </Link>
      </Alert>

      <Stack direction="row" alignItems="center" flexWrap="wrap" gap={3} sx={styles.actions}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="body2">Since Seconds</Typography>
          <Tooltip title={POD_LOGS_TOOLTIPS.sinceSeconds}>
            <Box component="span" tabIndex={0} role="note" aria-label={POD_LOGS_TOOLTIPS.sinceSeconds} sx={styles.helpIcon}>
              <HelpCircle size={13} />
            </Box>
          </Tooltip>
          <TextField size="small" type="number" value={sinceInput} onChange={(e) => setSinceInput(e.target.value)} inputProps={{ min: 1, 'aria-label': 'Since seconds' }} sx={styles.sinceSecondsInput} />
        </Stack>

        {containers.length > 1 && (
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography variant="body2">Container</Typography>
            <Select size="small" value={containerName ?? ''} onChange={(e) => setContainerName(e.target.value as string)} inputProps={{ 'aria-label': 'Container' }} sx={styles.containerSelect}>
              {containers.map((c) => (
                <MenuItem key={c.name} value={c.name}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </Stack>
        )}

        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="body2">Show Previous Logs</Typography>
          <Tooltip title={POD_LOGS_TOOLTIPS.previousLogs}>
            <Box component="span" tabIndex={0} role="note" aria-label={POD_LOGS_TOOLTIPS.previousLogs} sx={styles.helpIcon}>
              <HelpCircle size={13} />
            </Box>
          </Tooltip>
          <Switch size="small" checked={previous} disabled={!hasPreviousLogs} onChange={(e) => setPrevious(e.target.checked)} inputProps={{ 'aria-label': 'Show previous logs' }} />
        </Stack>

        <Button size="small" variant="text" startIcon={isFetching ? <CircularProgress size={14} /> : <RefreshCw size={14} />} onClick={() => refetch()} disabled={isFetching}>
          Refresh Logs
        </Button>
      </Stack>

      <OutlinedInput
        fullWidth
        size="small"
        placeholder={filterMode ? 'Enter keyword to filter and highlight logs' : 'Enter keyword to highlight in logs'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        startAdornment={
          <InputAdornment position="start">
            <Search size={16} />
          </InputAdornment>
        }
        endAdornment={
          search ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setSearch('')} edge="end" aria-label="Clear search">
                <X size={13} />
              </IconButton>
            </InputAdornment>
          ) : null
        }
        sx={styles.search}
      />
      <Stack direction="row" alignItems="center" gap={1} sx={styles.filterToggle}>
        <Typography variant="body2">Only show logs containing the search keyword</Typography>
        <Switch size="small" checked={filterMode} onChange={(e) => setFilterMode(e.target.checked)} inputProps={{ 'aria-label': 'Only show logs containing the search keyword' }} />
      </Stack>

      {isError ? (
        <Alert severity="error">
          Failed to fetch container logs
          {error?.message && (
            <Typography variant="body2" sx={styles.errorDetail}>
              {error.message}
            </Typography>
          )}
        </Alert>
      ) : isLoading ? (
        <Box sx={styles.loading}>
          <CircularProgress />
        </Box>
      ) : (
        <Box component="pre" sx={styles.logView}>
          {!logs
            ? 'No logs to show...'
            : filterMode && !lines.length
              ? 'No matching logs found'
              : lines.map((line, i) => (
                  <Box key={i} component="span" sx={styles.logLine}>
                    {search ? highlightText(line, search) : line}
                  </Box>
                ))}
        </Box>
      )}
    </PodDrawerShell>
  );
}
