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

import { Alert, DialogContentText, TextField } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import type { Environment } from '../../types/environment';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';

const gapSx = { mb: 2 } as const;

interface DeprovisionUserPortalDialogProps {
  environment: Environment;
  isPending: boolean;
  /** The deprovision's failure, worded for the environment. */
  error: string | null;
  onDeprovision: () => void;
  onClose: () => void;
}

/**
 * Confirms deprovisioning an environment's User Portal by having the user type the environment's name: it unpublishes
 * every integration published there. A later environment's portal may still need it, so ipaas-service may suspend it
 * rather than remove it; either way it stops serving.
 */
export default function DeprovisionUserPortalDialog({ environment, isPending, error, onDeprovision, onClose }: DeprovisionUserPortalDialogProps): JSX.Element {
  const [confirmText, setConfirmText] = useState('');

  return (
    <ConfirmDeleteDialog
      title={`Deprovision the User Portal in ${environment.name}`}
      onConfirm={onDeprovision}
      onClose={onClose}
      isPending={isPending}
      confirmDisabled={confirmText.trim() !== environment.name}
      confirmLabel="Deprovision"
      pendingLabel="Deprovisioning…"
      maxWidth="xs">
      {error && (
        <Alert severity="error" sx={gapSx}>
          {error}
        </Alert>
      )}
      <DialogContentText sx={gapSx}>This unpublishes every integration published to the User Portal in {environment.name}, and stops the portal. Type the environment name to confirm.</DialogContentText>
      <TextField value={confirmText} onChange={(e) => setConfirmText(e.target.value)} fullWidth placeholder="Enter environment name to confirm" autoFocus slotProps={{ htmlInput: { 'aria-label': 'Environment name' } }} />
    </ConfirmDeleteDialog>
  );
}
