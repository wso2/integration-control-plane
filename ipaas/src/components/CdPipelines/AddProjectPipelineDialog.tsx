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

import { Alert, Autocomplete, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../common/TextField';
import { useMemo, useState, type ReactNode } from 'react';
import { useOrgDeploymentPipelines, useUpdateProjectDeploymentPipelines } from '../../hooks/useDeploymentPipelines';
import type { DeploymentPipeline } from '../../types/deploymentPipeline';

interface AddProjectPipelineDialogProps {
  projectId: string;
  /** Pipelines already in the project, excluded from the picker. */
  currentPipelineIds: string[];
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * Sets a project's deployment pipeline. A project is bound to exactly one pipeline,
 * so the chosen org pipeline replaces the current one.
 */
export default function AddProjectPipelineDialog({ projectId, currentPipelineIds, onClose, onDone, onError }: AddProjectPipelineDialogProps): ReactNode {
  const { data: orgPipelines, isLoading, isError, refetch } = useOrgDeploymentPipelines();
  const update = useUpdateProjectDeploymentPipelines(projectId);
  const [selected, setSelected] = useState<DeploymentPipeline | null>(null);

  const available = useMemo(() => (orgPipelines ?? []).filter((p) => !currentPipelineIds.includes(p.id)), [orgPipelines, currentPipelineIds]);

  const add = () =>
    update.mutate(selected ? [selected.id] : [], {
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
      <DialogTitle>Set Deployment Pipeline</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>Select the deployment pipeline for your project.</DialogContentText>
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
            options={available}
            value={selected}
            onChange={(_, v) => setSelected(v)}
            getOptionLabel={(p) => p.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            disabled={update.isPending}
            renderInput={(params) => <TextField {...params} label="Pipeline" />}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={add} disabled={!selected || update.isPending} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {update.isPending ? 'Adding…' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
