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

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import * as styles from './UserPortal.styles';

interface PublishWorkflowDialogProps {
  envName: string;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
  /** Why the last publish failed, worded for the reader; null when it didn't. */
  error: string | null;
}

/**
 * Confirms a publish that redeploys a workflow. From then on its Workflow Management API takes only User Portal
 * sign-ins, on the gateway and in the workflow itself, so the console's runs and human tasks views stop working in
 * the environment and the User Portal is where the workflow is managed. Unpublishing gives the console its views back.
 */
export default function PublishWorkflowDialog({ envName, onConfirm, onClose, isPending, error }: PublishWorkflowDialogProps): JSX.Element {
  return (
    <Dialog open onClose={isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Publish to the User Portal in {envName}?</DialogTitle>
      <DialogContent>
        <Alert severity="warning">The integration will be redeployed in {envName}, and the console&apos;s workflow management features will be turned off there.</Alert>
        <Typography variant="body2" sx={styles.dialogBodySx}>
          Its Workflow Management API will accept only User Portal sign-ins, so the console can no longer show or act on its runs and human tasks in {envName}. Use the User Portal for all workflow management. Unpublishing turns the console&apos;s workflow
          management back on.
        </Typography>
        {error && (
          <Typography variant="body2" color="error" sx={styles.dialogErrorSx}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onConfirm} disabled={isPending} startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {isPending ? 'Publishing…' : 'Publish'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
