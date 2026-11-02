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

import { Box, Button, CircularProgress, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useExecutionConfigs } from '../../../hooks/useExecutions';
import { useDeployDeploymentTrack } from '../../../hooks/useDeployments';
import ScheduleFields from './ScheduleFields';
import { buildScheduleDeployInput, useScheduleForm } from './useScheduleForm';

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
}

export default function ScheduleDialog({ open, onClose, onSaveSuccess, onSaveError, envId, envName: _envName, componentId, releaseId, buildId, versionId, deploymentPipelineId, allowWithoutBuild = false }: ScheduleDialogProps) {
  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  const { data: existingConfigs, isLoading: loadingConfigs } = useExecutionConfigs(componentId, releaseId, envId);
  const deployTrack = useDeployDeploymentTrack();
  const form = useScheduleForm(existingConfigs);

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

  const drawerSx = {
    '& .MuiDrawer-paper': {
      width: 440,
      position: 'fixed',
      top: 64,
      height: 'calc(100% - 64px)',
      borderLeft: '1px solid',
      borderColor: 'divider',
      display: 'flex',
      flexDirection: 'column',
    },
  };

  return (
    <Drawer anchor="right" open={open} onClose={handleClose} variant="temporary" sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="h5">Schedule</Typography>
        <IconButton size="small" aria-label="close" onClick={handleClose}>
          <X size={16} />
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
        {loadingConfigs ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress size={24} color="primary" />
          </Box>
        ) : (
          <ScheduleFields form={form} />
        )}
      </Box>

      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Button onClick={onClose}>Back</Button>
        <Button variant="contained" onClick={handleSave} disabled={deployTrack.isPending || (!buildId && !allowWithoutBuild) || !form.isValid} startIcon={deployTrack.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
          {deployTrack.isPending ? 'Updating…' : 'Update'}
        </Button>
      </Stack>
    </Drawer>
  );
}
