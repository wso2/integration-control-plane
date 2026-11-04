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
import { useDeleteDatabaseServer } from '../../hooks/useDatabases';
import type { DatabaseServer } from '../../types/databases';

interface DeleteDatabaseDialogProps {
  server: Pick<DatabaseServer, 'id' | 'name'>;
  onClose: () => void;
  onDeleted?: () => void;
}

/**
 * Confirms deleting a database by its name. The teardown takes the data and
 * every backup with it, so there is nothing to restore from afterwards.
 */
export default function DeleteDatabaseDialog({ server, onClose, onDeleted }: DeleteDatabaseDialogProps): JSX.Element {
  const [confirm, setConfirm] = useState('');
  const del = useDeleteDatabaseServer();

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
          {del.error.message || 'The database could not be deleted. Try again.'}
        </Alert>
      )}
      <Typography variant="body2" sx={{ mb: 2 }}>
        This permanently removes the database, all its data and its backups. Integrations connected to it will stop working. This cannot be undone.
      </Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Type the database name to confirm
      </Typography>
      <TextField autoFocus placeholder="Enter database name" value={confirm} onChange={(e) => setConfirm(e.target.value)} fullWidth />
    </ConfirmDeleteDialog>
  );
}
