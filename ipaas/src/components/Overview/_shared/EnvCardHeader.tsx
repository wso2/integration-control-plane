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

import { IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { GitCommit, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';

export interface EnvCardHeaderProps {
  envName: string;
  /** The commit this environment is actually running — not the repo's newest. */
  deployedCommit?: { sha: string; message?: string } | null;
  hasDeployment: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  /** Type-specific left-cluster content (status dot + Configure), after the commit. */
  status?: ReactNode;
  /** Type-specific right-cluster action buttons, before the Refresh icon. */
  actions?: ReactNode;
}

/**
 * The generic env-card header frame: env name + commit on the left, Refresh on
 * the right, with two type-owned slots — `status` (left, after the commit) and
 * `actions` (right, before Refresh). It holds NO type-specific logic; the
 * status dot, Configure button and action buttons all live in the type's slot
 * components. Types whose header differs entirely provide a `CustomHeader`
 * instead (the shell renders that in place of this frame).
 */
export default function EnvCardHeader({ envName, deployedCommit, hasDeployment, isRefreshing, onRefresh, status, actions }: EnvCardHeaderProps) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap">
      {/* Left: env name + commit + type status slot */}
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 }}>
          {envName}
        </Typography>

        {hasDeployment && deployedCommit?.sha && (
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
            <GitCommit size={14} style={{ opacity: 0.55, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary', flexShrink: 0 }}>
              {deployedCommit.sha.substring(0, 7)}
            </Typography>
            {deployedCommit.message && (
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {deployedCommit.message}
              </Typography>
            )}
          </Stack>
        )}

        {status}
      </Stack>

      {/* Right: type action slot + Refresh */}
      <Stack direction="row" alignItems="center" gap={1} sx={{ flexShrink: 0 }}>
        {actions}
        <Tooltip title="Refresh">
          <IconButton size="small" disabled={isRefreshing} aria-label="Refresh" onClick={onRefresh}>
            <RefreshCw size={16} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none', transformOrigin: 'center' }} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}
