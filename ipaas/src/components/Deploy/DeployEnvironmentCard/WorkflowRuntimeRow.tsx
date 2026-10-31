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

import { Box, Button, Chip, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useEnsureWorkflowRuntime, useWorkflowRuntime } from '../../../hooks/useWorkflowRuntime';
import type { WorkflowRuntimeStatus } from '../../../types/workflowRuntime';

const STATUS_CHIP: Record<WorkflowRuntimeStatus, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  READY: { label: 'Ready', color: 'success' },
  PROVISIONING: { label: 'Preparing', color: 'warning' },
  NOT_PROVISIONED: { label: 'Not started', color: 'default' },
  ERROR: { label: 'Unavailable', color: 'error' },
  NOT_CONFIGURED: { label: 'Not available', color: 'error' },
};

const chipSx = { height: 18, fontSize: '0.65rem' } as const;

interface WorkflowRuntimeRowProps {
  /** The OpenChoreo environment name, which names the environment's namespace. */
  environment: string;
}

/**
 * The workflow runtime a workflow integration runs on in this environment: the
 * platform's managed Temporal server and the environment's namespace on it. Read-only;
 * the platform provides it.
 */
export default function WorkflowRuntimeRow({ environment }: WorkflowRuntimeRowProps): JSX.Element {
  const { data: runtime, isLoading, isError, refetch } = useWorkflowRuntime();
  const ensure = useEnsureWorkflowRuntime();

  if (isLoading) return <Skeleton variant="rounded" height={40} sx={{ mt: 2 }} />;
  if (isError || !runtime) {
    return (
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
        <Typography variant="caption" color="error">
          Could not load the workflow runtime.
        </Typography>
        <Button size="small" onClick={() => refetch()}>
          Retry
        </Button>
      </Stack>
    );
  }

  const chip = STATUS_CHIP[runtime.status];
  const namespace = runtime.namespaces.find((n) => n.environment === environment)?.namespace;
  const canStart = runtime.status === 'NOT_PROVISIONED' || runtime.status === 'ERROR';

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          Workflow runtime
        </Typography>
        <Chip size="small" label={chip.label} color={chip.color} sx={chipSx} />
      </Stack>
      {runtime.serverName && (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {runtime.serverName}
          {namespace && ` · ${namespace}`}
        </Typography>
      )}
      {runtime.status === 'PROVISIONING' && (
        <Typography variant="caption" color="text.secondary">
          Deploy becomes available once the runtime is ready. This takes a few minutes.
        </Typography>
      )}
      {canStart && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.5 }}>
          <Typography variant="caption" color={ensure.isError ? 'error' : 'text.secondary'}>
            {ensure.isError ? ensure.error.message : 'The runtime is not running.'}
          </Typography>
          <Button size="small" onClick={() => ensure.mutate()} disabled={ensure.isPending}>
            {ensure.isPending ? 'Starting…' : 'Retry'}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
