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

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@wso2/oxygen-ui';
import type { ReactNode } from 'react';
import { useSetDefaultProjectDeploymentPipeline } from '../../hooks/useDeploymentPipelines';
import type { DeploymentPipeline } from '../../types/deploymentPipeline';

interface SetDefaultPipelineDialogProps {
  projectId: string;
  pipeline: DeploymentPipeline;
  onClose: () => void;
  onDone: (name: string) => void;
  onError: (message: string) => void;
}

/** Confirms setting a pipeline as the project's default (PATCH). Owns its mutation. */
export default function SetDefaultPipelineDialog({ projectId, pipeline, onClose, onDone, onError }: SetDefaultPipelineDialogProps): ReactNode {
  const setDefault = useSetDefaultProjectDeploymentPipeline(projectId);

  const confirm = () =>
    setDefault.mutate(pipeline.id, {
      onSuccess: () => {
        onClose();
        onDone(pipeline.name);
      },
      onError: (e) => {
        onClose();
        onError(e.message || 'Failed to update the default pipeline.');
      },
    });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Set &lsquo;{pipeline.name}&rsquo; as default?</DialogTitle>
      <DialogContent>
        <DialogContentText>This will be used as the default pipeline for all components in the project.</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={setDefault.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={confirm} disabled={setDefault.isPending} startIcon={setDefault.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {setDefault.isPending ? 'Setting…' : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
