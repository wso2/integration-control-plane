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

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

interface AlertRuleDiscardDialogProps {
  isOpen: boolean;
  alertType?: string;
  handleClose: () => void;
  handleConfirm: () => void;
  isLoading: boolean;
}

export default function AlertRuleDiscardDialog(props: AlertRuleDiscardDialogProps): JSX.Element {
  const { isOpen, alertType, isLoading, handleClose, handleConfirm } = props;
  const label = alertType ?? 'alert';

  return (
    <Dialog open={isOpen} fullWidth maxWidth="sm">
      <DialogTitle>Discard Changes</DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          Are you sure you want to discard the <strong>{label}</strong> type alert rule?
        </Typography>
        <Typography variant="body2">This will remove all unsaved changes made to the alert rule.</Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="contained" color="primary" onClick={handleConfirm} disabled={isLoading} startIcon={isLoading ? <CircularProgress size={14} color="inherit" /> : undefined} autoFocus>
          {isLoading ? 'Discarding' : 'Discard'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
