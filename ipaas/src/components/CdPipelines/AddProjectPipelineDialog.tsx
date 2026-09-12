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

import { Alert, Autocomplete, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useMemo, useState, type ReactNode } from 'react';
import { useOrgDeploymentPipelines, useUpdateProjectDeploymentPipelines } from '../../hooks/useDeploymentPipelines';
import { IS_CLOUD } from '../../features';
import type { DeploymentPipeline } from '../../types/deploymentPipeline';

interface AddProjectPipelineDialogProps {
  projectId: string;
  /** Pipelines already in the project — excluded from the picker and preserved on save. */
  currentPipelineIds: string[];
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * Adds org pipelines to a project. The org pipelines not already in the project
 * are multi-selectable; saving PUTs the current ids plus the chosen ones (the
 * project pipeline set is a full replace).
 *
 * Cloud binds a project to exactly one pipeline, so there the picker is single-select
 * and the chosen pipeline replaces the current one rather than joining it.
 */
export default function AddProjectPipelineDialog({ projectId, currentPipelineIds, onClose, onDone, onError }: AddProjectPipelineDialogProps): ReactNode {
  const { data: orgPipelines, isLoading, isError, refetch } = useOrgDeploymentPipelines();
  const update = useUpdateProjectDeploymentPipelines(projectId);
  const [selected, setSelected] = useState<DeploymentPipeline[]>([]);

  const available = useMemo(() => (orgPipelines ?? []).filter((p) => !currentPipelineIds.includes(p.id)), [orgPipelines, currentPipelineIds]);

  const chosen = selected.map((p) => p.id);
  const add = () =>
    update.mutate(IS_CLOUD ? chosen : [...currentPipelineIds, ...chosen], {
      onSuccess: () => {
        onClose();
        onDone();
      },
      onError: (e) => {
        onClose();
        onError(e.message || 'Failed to add pipelines.');
      },
    });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{IS_CLOUD ? 'Set Deployment Pipeline' : 'Add Deployment Pipelines'}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{IS_CLOUD ? 'Select the deployment pipeline for your project.' : 'Select deployment pipelines to add to your project.'}</DialogContentText>
        {isLoading ? (
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Loading pipelines…
            </Typography>
          </Stack>
        ) : isError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }>
            Failed to load organization pipelines.
          </Alert>
        ) : available.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No additional pipelines available to add.
          </Typography>
        ) : (
          <Autocomplete
            multiple={!IS_CLOUD}
            options={available}
            value={IS_CLOUD ? (selected[0] ?? null) : selected}
            onChange={(_, v) => setSelected(v === null ? [] : Array.isArray(v) ? v : [v])}
            getOptionLabel={(p) => p.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            disabled={update.isPending}
            renderInput={(params) => <TextField {...params} label={IS_CLOUD ? 'Pipeline' : 'Pipelines'} placeholder={IS_CLOUD ? 'Select a pipeline' : 'Select pipelines'} />}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={add} disabled={selected.length === 0 || update.isPending} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {update.isPending ? 'Adding…' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
