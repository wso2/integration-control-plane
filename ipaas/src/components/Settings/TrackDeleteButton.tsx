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

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Tooltip } from '@wso2/oxygen-ui';
import { Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactNode } from 'react';
import { useCheckDeploymentTrackDeletable, useDeleteDeploymentTrack } from '../../hooks/useComponents';

interface TrackDeleteButtonProps {
  orgHandler: string;
  projectId: string;
  componentId: string;
  /** Track or proxy-version id (both delete via the same mutation). */
  trackId: string;
  /** Used for the aria-label. */
  label: string;
  /** When true the button is disabled (e.g. the last remaining track/version). */
  disabled?: boolean;
  disabledTooltip?: string;
  confirmTitle: string;
  confirmBody: ReactNode;
  onResult: (result: { type: 'success' | 'error'; message: string }) => void;
}

/**
 * Per-row delete control for deployment tracks / proxy versions: runs the
 * pre-flight deletability check, then confirms and deletes. Shared by the
 * Deployment Tracks and Proxy Versions settings pages.
 */
export default function TrackDeleteButton({ orgHandler, projectId, componentId, trackId, label, disabled, disabledTooltip, confirmTitle, confirmBody, onResult }: TrackDeleteButtonProps): JSX.Element {
  const check = useCheckDeploymentTrackDeletable();
  const del = useDeleteDeploymentTrack();
  const [confirming, setConfirming] = useState(false);

  const path = { orgHandler, componentId, projectId, deploymentTrackId: trackId };

  const requestDelete = () =>
    check.mutate(path, {
      onSuccess: (res) => (res.canDelete ? setConfirming(true) : onResult({ type: 'error', message: res.message || 'This item cannot be deleted.' })),
      onError: (e) => onResult({ type: 'error', message: e instanceof Error ? e.message : 'Could not check deletability.' }),
    });

  const confirmDelete = () =>
    del.mutate(path, {
      onSuccess: (res) => {
        setConfirming(false);
        onResult(res.canDelete === false ? { type: 'error', message: res.message || 'Delete failed.' } : { type: 'success', message: 'Deleted.' });
      },
      onError: (e) => {
        setConfirming(false);
        onResult({ type: 'error', message: e instanceof Error ? e.message : 'Delete failed.' });
      },
    });

  return (
    <>
      <Tooltip title={disabled ? (disabledTooltip ?? '') : 'Delete'}>
        <span>
          <IconButton size="small" color="error" aria-label={`Delete ${label}`} disabled={disabled || check.isPending} onClick={requestDelete}>
            <Trash2 size={16} />
          </IconButton>
        </span>
      </Tooltip>
      {confirming && (
        <Dialog open onClose={() => setConfirming(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{confirmTitle}</DialogTitle>
          <DialogContent>
            <DialogContentText>{confirmBody}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirming(false)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={confirmDelete} disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
