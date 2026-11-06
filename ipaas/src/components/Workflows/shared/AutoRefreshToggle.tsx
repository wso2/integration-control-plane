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

import { FormControlLabel, Stack, Switch, Tooltip, Typography } from '@wso2/oxygen-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, useSyncExternalStore, type JSX } from 'react';
import { isScopedWorkflowKey } from '../api/queryKeys';
import { autoRefreshEnabled, isWorkflowDataQuery, setAutoRefreshEnabled } from './autoRefresh';

const switchLabelSx = { mr: 0, ml: 0, gap: 0.5 } as const;

const ON_HELP = 'Auto-refresh is on: this view fetches fresh data while you have it open. The refresh button always works.';
const OFF_HELP = 'Auto-refresh is off: this view updates only when you refresh it.';

/** When any read of the connection `scopeId` names last brought fresh data, as epoch milliseconds. */
function useLatestUpdate(scopeId: string | undefined): number {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback((onChange: () => void) => cache.subscribe(onChange), [cache]);
  const latest = () => (scopeId ? Math.max(0, ...cache.findAll({ predicate: (query) => isScopedWorkflowKey(query.queryKey, scopeId) }).map((query) => query.state.dataUpdatedAt)) : 0);
  return useSyncExternalStore(subscribe, latest);
}

interface AutoRefreshToggleProps {
  /** Epoch milliseconds of the view's latest successful read; by default, the latest of `scopeId`'s reads. */
  updatedAt?: number;
  /** The connection whose reads the "Updated" time follows, when `updatedAt` is not given. */
  scopeId?: string;
}

/**
 * The auto-refresh switch, with when the view last got fresh data. Switching it back on refetches the workflow views at once, so nothing waits a
 * whole interval to catch up.
 */
export default function AutoRefreshToggle({ updatedAt, scopeId }: AutoRefreshToggleProps): JSX.Element {
  const queryClient = useQueryClient();
  const [on, setOn] = useState(autoRefreshEnabled);
  const latest = useLatestUpdate(scopeId);
  const shownAt = updatedAt ?? latest;

  return (
    <Stack direction="row" alignItems="center" gap={1.5}>
      {!!shownAt && (
        <Typography variant="caption" color="text.secondary">
          {`Updated ${new Date(shownAt).toLocaleTimeString()}`}
        </Typography>
      )}
      <Tooltip title={on ? ON_HELP : OFF_HELP}>
        <FormControlLabel
          sx={switchLabelSx}
          label={<Typography variant="body2">Auto-refresh</Typography>}
          control={
            <Switch
              size="small"
              checked={on}
              onChange={(event) => {
                const next = event.target.checked;
                setAutoRefreshEnabled(next);
                setOn(next);
                if (next) {
                  void queryClient.invalidateQueries({ predicate: (query) => isWorkflowDataQuery(query.queryKey) });
                }
              }}
            />
          }
        />
      </Tooltip>
    </Stack>
  );
}
