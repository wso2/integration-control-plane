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

import { Alert, DialogContentText, TextField } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useDeleteProject } from '../hooks/useProjects';
import type { Project } from '../types/project';
import { apiErrorMessage, httpStatusOf } from '../utils/apiErrors';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';

const DELETE_FAILED = 'Failed to delete the project. Please try again.';

/** Confirms a project deletion by having the user type the project name. */
export default function DeleteProjectDialog({ project, onClose }: { project: Project; onClose: () => void }): JSX.Element {
  const remove = useDeleteProject();
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () =>
    remove.mutate(project.id, {
      onSuccess: onClose,
      onError: (e) => {
        console.error('Failed to delete project', e);
        // A 409 is a refusal a retry can't change (an MCP server Agent Manager agents use, an integration
        // published to the User Portal), so the BFF's own sentence says what to do first.
        setError(httpStatusOf(e) === 409 ? apiErrorMessage(e, DELETE_FAILED) : DELETE_FAILED);
      },
    });

  return (
    <ConfirmDeleteDialog
      title={
        <>
          Are you sure you want to remove the project &lsquo;<strong>{project.name}</strong>&rsquo;?
        </>
      }
      onConfirm={handleDelete}
      onClose={onClose}
      isPending={remove.isPending}
      confirmDisabled={confirmText.trim() !== project.name}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <DialogContentText sx={{ mb: 2 }}>This action will be irreversible and all related details will be lost. Please type in the project name below to confirm.</DialogContentText>
      <TextField value={confirmText} onChange={(e) => setConfirmText(e.target.value)} fullWidth placeholder="Enter project name to confirm" autoFocus slotProps={{ htmlInput: { 'aria-label': 'Project name' } }} />
    </ConfirmDeleteDialog>
  );
}
