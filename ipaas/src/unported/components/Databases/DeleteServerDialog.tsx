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
import TextField from '../../../components/common/TextField';
import { useState, type JSX } from 'react';
import { useDeleteServer } from '../../hooks/usePlatformServices';
import ConfirmDeleteDialog from '../../../components/ConfirmDeleteDialog';
import type { DatabaseServer, ServerVariant } from '../../../types/platformServices';

interface DeleteServerDialogProps {
  server: DatabaseServer;
  /** Whether the org is on a paid plan — free-tier deletes don't restore the quota. */
  isSubscribed: boolean;
  variant?: ServerVariant;
  onClose: () => void;
  onDeleted: (name: string) => void;
  onError: (message: string) => void;
}

/** Type-to-confirm delete for a managed server: the user must type the server name to enable delete. */
export default function DeleteServerDialog({ server, isSubscribed, variant = 'db-servers', onClose, onDeleted, onError }: DeleteServerDialogProps): JSX.Element {
  const del = useDeleteServer(variant);
  const [input, setInput] = useState('');
  const confirmed = input === server.name;

  const doDelete = () => {
    if (!confirmed || del.isPending) return;
    del.mutate(server.id, {
      onSuccess: () => {
        onClose();
        onDeleted(server.name);
      },
      onError: (e) => {
        onClose();
        onError(e instanceof Error ? e.message : 'Failed to delete the server.');
      },
    });
  };

  return (
    <ConfirmDeleteDialog
      title={
        <>
          Are you sure you want to delete &lsquo;<strong>{server.name}</strong>&rsquo;?
        </>
      }
      onConfirm={doDelete}
      onClose={onClose}
      isPending={del.isPending}
      confirmDisabled={!confirmed}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This permanently removes the database server and all its data. This action can&apos;t be undone. Please type the server name <strong>{server.name}</strong> below to confirm.
      </Typography>
      <TextField
        autoFocus
        fullWidth
        size="small"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') doDelete();
        }}
        placeholder="Enter server name to confirm"
        inputProps={{ 'aria-label': 'Confirm server name' }}
      />
      {!isSubscribed && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Deleting this resource will not reset your free-tier limit. You&apos;ll need to upgrade your subscription to create additional cloud resources.
        </Alert>
      )}
    </ConfirmDeleteDialog>
  );
}
