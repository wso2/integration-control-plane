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

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { useState, type JSX } from 'react';
import { useUpdateMaintenanceWindow } from '../../../hooks/usePlatformServices';
import { MAINTENANCE_DAYS, MAINTENANCE_TIMES } from '../../../../constants/platformServices';
import type { MaintenanceWindow, ServerVariant } from '../../../../types/platformServices';

interface MaintenanceWindowDialogProps {
  serverId: string;
  variant?: ServerVariant;
  current?: MaintenanceWindow;
  onClose: () => void;
  onResult: (type: 'success' | 'error', message: string) => void;
}

export default function MaintenanceWindowDialog({ serverId, variant = 'db-servers', current, onClose, onResult }: MaintenanceWindowDialogProps): JSX.Element {
  const [day, setDay] = useState(current?.day || 'monday');
  const [time, setTime] = useState(current?.time?.slice(0, 5) || '00:00');
  const update = useUpdateMaintenanceWindow(serverId, variant);

  const save = () => {
    update.mutate(
      { day, time },
      {
        onSuccess: () => {
          onResult('success', 'Maintenance window updated.');
          onClose();
        },
        onError: (e) => onResult('error', e instanceof Error ? e.message : 'Failed to update the maintenance window.'),
      },
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Maintenance Window</DialogTitle>
      <DialogContent>
        <Stack direction="row" gap={2} sx={{ mt: 1 }}>
          <TextField select fullWidth size="small" label="Day of week" value={day} onChange={(e) => setDay(e.target.value)}>
            {MAINTENANCE_DAYS.map((d) => (
              <MenuItem key={d.value} value={d.value}>
                {d.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select fullWidth size="small" label="Time (UTC)" value={time} onChange={(e) => setTime(e.target.value)}>
            {MAINTENANCE_TIMES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={update.isPending} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {update.isPending ? 'Updating…' : 'Update'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
