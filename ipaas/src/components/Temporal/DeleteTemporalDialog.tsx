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

import { Alert, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';
import TextField from '../common/TextField';
import { useDeleteTemporalServer } from '../../hooks/useTemporal';
import type { TemporalServer } from '../../types/temporal';

interface DeleteTemporalDialogProps {
  server: Pick<TemporalServer, 'id' | 'name'>;
  onClose: () => void;
  onDeleted?: () => void;
}

/** Confirms deleting a Temporal server by its name. The teardown takes every namespace and its workflow history with it. */
export default function DeleteTemporalDialog({ server, onClose, onDeleted }: DeleteTemporalDialogProps): JSX.Element {
  const [confirm, setConfirm] = useState('');
  const del = useDeleteTemporalServer();

  const doDelete = () =>
    del.mutate(server.id, {
      onSuccess: () => {
        onClose();
        onDeleted?.();
      },
    });

  return (
    <ConfirmDeleteDialog
      title={
        <>
          Delete <strong>&lsquo;{server.name}&rsquo;</strong>?
        </>
      }
      onConfirm={doDelete}
      onClose={onClose}
      isPending={del.isPending}
      confirmDisabled={confirm !== server.name}>
      {del.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {del.error.message || 'The Temporal server could not be deleted. Try again.'}
        </Alert>
      )}
      <Typography variant="body2" sx={{ mb: 2 }}>
        This permanently removes the Temporal server, its namespaces and all workflow history. Running workflows stop, and workers connected to it will fail. This cannot be undone.
      </Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Type the server name to confirm
      </Typography>
      <TextField autoFocus placeholder="Enter server name" value={confirm} onChange={(e) => setConfirm(e.target.value)} fullWidth />
    </ConfirmDeleteDialog>
  );
}
