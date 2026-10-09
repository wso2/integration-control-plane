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

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { useState, type JSX } from 'react';

interface OnPremKeyFormDialogProps {
  title: string;
  submitLabel: string;
  busyLabel: string;
  initialName?: string;
  busy: boolean;
  error?: string;
  onSubmit: (displayName: string) => void;
  onClose: () => void;
}

/** Shared name-input dialog for generating a new on-prem key and renaming an existing one. */
export default function OnPremKeyFormDialog({ title, submitLabel, busyLabel, initialName = '', busy, error, onSubmit, onClose }: OnPremKeyFormDialogProps): JSX.Element {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField label="Key name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required autoFocus sx={{ mt: 1, '& .MuiFormLabel-asterisk': { color: 'error.main' } }} />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => onSubmit(trimmed)} disabled={!trimmed || busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {busy ? busyLabel : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
