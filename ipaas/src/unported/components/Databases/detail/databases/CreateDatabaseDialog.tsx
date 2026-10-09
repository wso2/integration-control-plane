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

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@wso2/oxygen-ui';
import TextField from '../../../../../components/common/TextField';
import { useState, type JSX } from 'react';
import { useCreateDatabase } from '../../../../hooks/usePlatformServices';
import type { Notify } from './types';

interface CreateDatabaseDialogProps {
  serverId: string;
  existingNames: string[];
  onClose: () => void;
  notify: Notify;
}

export default function CreateDatabaseDialog({ serverId, existingNames, onClose, notify }: CreateDatabaseDialogProps): JSX.Element {
  const [name, setName] = useState('');
  const create = useCreateDatabase(serverId);

  const duplicate = existingNames.includes(name.trim());
  const error = duplicate ? 'A database with this name already exists.' : '';
  const canSubmit = name.trim() !== '' && !error && !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    create.mutate(name.trim(), {
      onSuccess: () => {
        notify('success', `Database '${name.trim()}' created.`);
        onClose();
      },
      onError: (e) => notify('error', e instanceof Error ? e.message : 'Failed to create the database.'),
    });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create a New Database</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="Database name"
          placeholder="E.g. my-database"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!!error}
          helperText={error || ' '}
          sx={{ mt: 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
