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

import { Button, CircularProgress, Stack } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useExecutionConfigs } from '../../../../hooks/useExecutions';
import { usePlanAccess } from '../../../../hooks/useBillingOrg';
import { SCHEDULE_POLICIES } from '../../../../constants/scheduleLimits';
import { useDeployDeploymentTrack } from '../../../../hooks/useDeployments';
import ScheduleFields from '../../_shared/ScheduleFields';
import { buildScheduleDeployInput, useScheduleForm } from '../../_shared/useScheduleForm';

interface ScheduleStepProps {
  componentId: string;
  versionId: string;
  envId: string;
  releaseId: string;
  deploymentPipelineId: string;
  /** Build id of the current deployment — required to redeploy with the schedule. */
  buildId: string;
  onNotify: (message: string, severity: 'success' | 'error') => void;
}

/**
 * The Configure-drawer Schedule step. Reuses the shared `ScheduleFields` cron
 * editor (same as the standalone Schedule drawer) and saves by redeploying the
 * deployment track with the cron fields via `useDeployDeploymentTrack`.
 */
export default function ScheduleStep({ componentId, versionId, envId, releaseId, deploymentPipelineId, buildId, onNotify }: ScheduleStepProps): JSX.Element {
  const { data: existingConfigs, isLoading } = useExecutionConfigs(componentId, releaseId, envId);
  const deployTrack = useDeployDeploymentTrack();
  const form = useScheduleForm(existingConfigs, usePlanAccess(), SCHEDULE_POLICIES.ingestion);

  const save = () => {
    deployTrack.mutate(buildScheduleDeployInput(form, { componentId, versionId, imageId: buildId, envId, deploymentPipelineId }), {
      onSuccess: () => onNotify('Schedule updated.', 'success'),
      onError: (e) => onNotify(e instanceof Error ? e.message : 'Failed to update the schedule.', 'error'),
    });
  };

  if (isLoading) return <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', my: 3 }} />;

  return (
    <Stack gap={2}>
      <ScheduleFields form={form} />
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={save} disabled={deployTrack.isPending || !buildId || !form.isValid} startIcon={deployTrack.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {deployTrack.isPending ? 'Updating…' : 'Update schedule'}
        </Button>
      </Stack>
    </Stack>
  );
}
