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

import { Box, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { useState, type JSX } from 'react';
import { useDeleteVolume } from '../../hooks/useStorage';
import ConfirmDeleteDialog from '../../../components/ConfirmDeleteDialog';
import type { Volume } from '../../../types/storage';

interface DeleteVolumeDialogProps {
  projectId: string;
  volume: Volume;
  onClose: () => void;
  onDeleted: (name: string) => void;
  onError: (message: string) => void;
}

const SOURCE = 'volume mount';

export default function DeleteVolumeDialog({ projectId, volume, onClose, onDeleted, onError }: DeleteVolumeDialogProps): JSX.Element {
  const del = useDeleteVolume(projectId);
  const [input, setInput] = useState('');
  const confirmed = input === volume.name;

  const doDelete = () => {
    if (!confirmed) return;
    del.mutate(volume.ID, {
      onSuccess: () => {
        onClose();
        onDeleted(volume.name);
      },
      onError: (e) => {
        onClose();
        onError(e instanceof Error ? e.message : 'Failed to delete the volume mount.');
      },
    });
  };

  return (
    <ConfirmDeleteDialog
      title={
        <>
          Are you sure you want to remove the {SOURCE} <strong>&lsquo;{volume.name}&rsquo;</strong>?
        </>
      }
      onConfirm={doDelete}
      onClose={onClose}
      isPending={del.isPending}
      confirmDisabled={!confirmed}
      pendingLabel="Removing…">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This removes the volume and all its container mounts. This action is irreversible. Please type the {SOURCE} name below to confirm.
      </Typography>
      <Box>
        <TextField
          autoFocus
          fullWidth
          size="small"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') doDelete();
          }}
          placeholder={`Enter ${SOURCE} name to confirm`}
          inputProps={{ 'aria-label': 'Confirm name' }}
        />
      </Box>
    </ConfirmDeleteDialog>
  );
}
