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
import { useUpdateProjectDeploymentPipelines } from '../../hooks/useDeploymentPipelines';
import type { DeploymentPipeline } from '../../types/deploymentPipeline';

interface RemoveProjectPipelineDialogProps {
  projectId: string;
  pipeline: DeploymentPipeline;
  /** The project's current pipeline ids — the removal PUTs this list minus the target. */
  currentPipelineIds: string[];
  onClose: () => void;
  onDone: (name: string) => void;
  onError: (message: string) => void;
}

/**
 * Confirms removing a pipeline from a project. The project pipeline set is a full
 * replace, so this PUTs the current ids with the target removed.
 */
export default function RemoveProjectPipelineDialog({ projectId, pipeline, currentPipelineIds, onClose, onDone, onError }: RemoveProjectPipelineDialogProps): ReactNode {
  const update = useUpdateProjectDeploymentPipelines(projectId);

  const confirm = () =>
    update.mutate(
      currentPipelineIds.filter((id) => id !== pipeline.id),
      {
        onSuccess: () => {
          onClose();
          onDone(pipeline.name);
        },
        onError: (e) => {
          onClose();
          onError(e.message || 'Failed to remove the pipeline.');
        },
      },
    );

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Remove &lsquo;{pipeline.name}&rsquo; from this project?</DialogTitle>
      <DialogContent>
        <DialogContentText>Components in this project will no longer be able to use this pipeline. You can add it back at any time.</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" color="error" onClick={confirm} disabled={update.isPending} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {update.isPending ? 'Removing…' : 'Remove'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
