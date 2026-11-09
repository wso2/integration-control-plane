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

import { Box, Button, CircularProgress, DrawerPanel } from '@wso2/oxygen-ui';
import { useExecutionConfigs } from '../../../hooks/useExecutions';
import { usePlanAccess } from '../../../hooks/useBillingOrg';
import { useDeployDeploymentTrack } from '../../../hooks/useDeployments';
import ScheduleFields from './ScheduleFields';
import { buildScheduleDeployInput, useScheduleForm } from './useScheduleForm';
import type { ScheduleKind } from '../../../types/schedule';
import { SCHEDULE_POLICIES } from '../../../constants/scheduleLimits';

interface ScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
  onSaveError?: (msg: string) => void;
  envId: string;
  envName: string;
  componentId: string;
  releaseId: string;
  buildId?: string;
  versionId: string;
  deploymentPipelineId: string;
  /** Save with no build: the BFF then releases the current workload. For image-only components such as knowledge base data sources. */
  allowWithoutBuild?: boolean;
  /** A knowledge base data source is an ingestion, with its own timeout limit. */
  kind?: ScheduleKind;
}

export default function ScheduleDialog({ open, onClose, onSaveSuccess, onSaveError, envId, envName: _envName, componentId, releaseId, buildId, versionId, deploymentPipelineId, allowWithoutBuild = false, kind = 'automation' }: ScheduleDialogProps) {
  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  const { data: existingConfigs, isLoading: loadingConfigs } = useExecutionConfigs(componentId, releaseId, envId);
  const deployTrack = useDeployDeploymentTrack();
  const form = useScheduleForm(existingConfigs, usePlanAccess(), SCHEDULE_POLICIES[kind]);

  const handleSave = () => {
    deployTrack.mutate(buildScheduleDeployInput(form, { componentId, versionId, imageId: buildId ?? '', envId, deploymentPipelineId }), {
      onSuccess: () => {
        onClose();
        onSaveSuccess?.();
      },
      onError: (err) => {
        const msg = err instanceof Error ? err.message : 'Failed to save schedule';
        onClose();
        onSaveError?.(msg);
      },
    });
  };

  return (
    <DrawerPanel open={open} onClose={handleClose} width={440}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>Schedule</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>
        {loadingConfigs ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress size={24} color="primary" />
          </Box>
        ) : (
          <ScheduleFields form={form} />
        )}
      </DrawerPanel.Body>

      <DrawerPanel.Footer>
        <Button onClick={onClose}>Back</Button>
        <Button variant="contained" onClick={handleSave} disabled={deployTrack.isPending || (!buildId && !allowWithoutBuild) || !form.isValid} startIcon={deployTrack.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
          {deployTrack.isPending ? 'Updating…' : 'Update'}
        </Button>
      </DrawerPanel.Footer>
    </DrawerPanel>
  );
}
