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

import { Button, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Play, RefreshCw, RotateCw, Square } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { DeployEnvironmentCardHeaderProps } from '../../../types/deploy';

export default function DeployEnvironmentCardHeader({ envName, showStop, stopDisabled, isStopPending, onStop, showStart, showRedeploy, isRedeployPending, onStart, onRefresh, isRefreshing }: DeployEnvironmentCardHeaderProps): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ flexWrap: 'wrap' }}>
        <Typography variant="h4" component="h2">
          {envName}
        </Typography>
      </Stack>

      <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0 }}>
        {showStart && (
          <Tooltip title={isRedeployPending ? '' : 'Restart deployment'}>
            <Button variant="outlined" size="small" color="success" startIcon={<Play size={14} />} disabled={isRedeployPending} onClick={onStart}>
              {isRedeployPending ? 'Restarting…' : 'Start'}
            </Button>
          </Tooltip>
        )}
        {showRedeploy && (
          <Tooltip title={isRedeployPending ? '' : 'Redeploy'}>
            <span>
              <Button variant="outlined" size="small" color="error" startIcon={<RotateCw size={14} />} disabled={isRedeployPending} onClick={onStart}>
                {isRedeployPending ? 'Redeploying…' : 'Redeploy'}
              </Button>
            </span>
          </Tooltip>
        )}
        {showStop && (
          <Tooltip title={stopDisabled ? 'Action in progress' : 'Stop deployment'}>
            <span>
              <Button variant="outlined" size="small" color="error" startIcon={<Square size={14} />} disabled={stopDisabled} onClick={onStop}>
                {isStopPending ? 'Stopping…' : 'Stop'}
              </Button>
            </span>
          </Tooltip>
        )}
        <Tooltip title="Refresh deployment status">
          <span>
            <IconButton aria-label="Refresh deployment status" size="small" onClick={onRefresh} disabled={isRefreshing}>
              <RefreshCw size={16} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Stack>
  );
}
