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

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, InputAdornment } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Pencil } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { ACTION_LABEL, ACTION_PENDING_LABEL, CONFIRM_TEXT, isDestructiveAction, PUBLISH_ACTIONS } from '../../constants/lifecycle';

export interface ConfirmDialogProps {
  action: string;
  displayName?: string;
  onDisplayNameChange?: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export default function ConfirmDialog({ action, displayName, onDisplayNameChange, onConfirm, onCancel, isPending }: ConfirmDialogProps): JSX.Element {
  const label = ACTION_LABEL[action] ?? action;
  const isPublish = PUBLISH_ACTIONS.has(action);
  const [isEditing, setIsEditing] = useState(false);
  const confirmDisabled = isPending || (isPublish && !displayName?.trim());
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{label} API</DialogTitle>
      <DialogContent>
        <DialogContentText>{CONFIRM_TEXT[action] ?? `Are you sure you want to ${label.toLowerCase()} this API?`}</DialogContentText>
        {isPublish && onDisplayNameChange !== undefined && (
          <TextField
            label="Display Name"
            value={displayName ?? ''}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            fullWidth
            size="small"
            sx={{
              mt: 3,
              ...(!isEditing && {
                '& .MuiOutlinedInput-root': { backgroundColor: 'action.hover' },
                '& .MuiOutlinedInput-input': { color: 'text.disabled', WebkitTextFillColor: 'unset' },
              }),
            }}
            InputProps={{
              readOnly: !isEditing,
              endAdornment: !isEditing && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setIsEditing(true)} edge="end">
                    <Pencil size={14} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button variant={isDestructiveAction(action) ? 'outlined' : 'contained'} color={isDestructiveAction(action) ? 'error' : 'primary'} onClick={onConfirm} disabled={confirmDisabled} startIcon={isPending ? <CircularProgress size={14} /> : undefined}>
          {isPending ? (ACTION_PENDING_LABEL[action] ?? `${label}ing…`) : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
