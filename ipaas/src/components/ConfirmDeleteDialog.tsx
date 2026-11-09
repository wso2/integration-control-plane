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
import type { JSX, ReactNode } from 'react';

interface ConfirmDeleteDialogProps {
  /** Dialog heading. Pass a node so callers can bold the entity name. */
  title: ReactNode;
  /** Body content — description, warnings, eligibility state, type-to-confirm field, etc. */
  children: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
  /** Disable the destructive action (e.g. until a confirmation gate passes). */
  confirmDisabled?: boolean;
  confirmLabel?: string;
  /** The label of the button that backs out, when "Cancel" would read as the action itself. */
  cancelLabel?: string;
  pendingLabel?: string;
  maxWidth?: 'xs' | 'sm' | 'md';
}

/**
 * Shared shell for destructive confirmation dialogs: owns the Dialog frame, the
 * Cancel / destructive-confirm actions, and the pending spinner + disabled gating.
 * Callers supply the title and body; confirmation logic (type-to-confirm,
 * eligibility checks) lives in the body they pass as children.
 */
export default function ConfirmDeleteDialog({ title, children, onConfirm, onClose, isPending, confirmDisabled = false, confirmLabel = 'Delete', cancelLabel = 'Cancel', pendingLabel = 'Deleting…', maxWidth = 'sm' }: ConfirmDeleteDialogProps): JSX.Element {
  return (
    <Dialog open onClose={isPending ? undefined : onClose} maxWidth={maxWidth} fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>{children}</DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={isPending}>
          {cancelLabel}
        </Button>
        <Button variant="contained" color="error" onClick={onConfirm} disabled={confirmDisabled || isPending} startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {isPending ? pendingLabel : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
