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

import { Alert, Box, Button, Chip, Paper, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Pencil, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { maintenanceDayLabel } from '../../../../constants/platformServices';
import DeleteServerDialog from '../DeleteServerDialog';
import DetailRow from './DetailRow';
import MaintenanceWindowDialog from './MaintenanceWindowDialog';
import AllowedIpsDialog from './AllowedIpsDialog';
import type { DatabaseServerDetail, ServerVariant } from '../../../../types/platformServices';

interface AdvancedSettingsTabProps {
  service: DatabaseServerDetail;
  isSubscribed: boolean;
  variant?: ServerVariant;
  onDeleted: () => void;
  onError: (message: string) => void;
}

export default function AdvancedSettingsTab({ service, isSubscribed, variant = 'db-servers', onDeleted, onError }: AdvancedSettingsTabProps): JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState<'maintenance' | 'ips' | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const onResult = (type: 'success' | 'error', message: string) => setAlert({ type, message });

  const maintenance = service.maintenance;
  const allowedIps = service.allowed_ips;
  const cidrs = allowedIps?.allow_list ?? [];
  const isPoweredOn = service.status === 'ACTIVE';

  const editButton = (target: 'maintenance' | 'ips') => (
    <Tooltip title={isPoweredOn ? 'Edit' : 'The server must be running to edit this.'}>
      <span>
        <Button size="small" startIcon={<Pencil size={14} />} disabled={!isPoweredOn} onClick={() => setEditing(target)}>
          Edit
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <Box>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Paper variant="outlined">
        <Typography variant="subtitle2" sx={{ fontWeight: 600, px: 3, py: 1.5 }}>
          Service Configuration
        </Typography>
        <DetailRow label="Service version" labelWidth={180}>
          <Typography variant="body2">{service.service_version || '—'}</Typography>
        </DetailRow>
        <DetailRow label="Maintenance window" labelWidth={180} action={editButton('maintenance')}>
          <Typography variant="body2">{maintenance?.day ? `${maintenanceDayLabel(maintenance.day)}, ${maintenance.time}` : 'Not scheduled'}</Typography>
        </DetailRow>
        <DetailRow label="Nodes" labelWidth={180}>
          {service.nodes.length > 0 ? (
            <Stack gap={0.5}>
              {service.nodes.map((n) => (
                <Stack key={n.name} direction="row" alignItems="center" gap={1} flexWrap="wrap">
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {n.name}
                  </Typography>
                  <Chip label={n.role} size="small" variant="outlined" />
                  <Chip label={n.state} size="small" variant="outlined" color={n.state.toUpperCase() === 'RUNNING' ? 'success' : 'default'} />
                </Stack>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2">—</Typography>
          )}
        </DetailRow>
        <DetailRow label="Allowed IP addresses" labelWidth={180} action={editButton('ips')}>
          {cidrs.length > 0 ? (
            <Stack direction="row" gap={0.5} flexWrap="wrap">
              {cidrs.map((ip) => (
                <Chip key={ip.cidr} label={ip.description ? `${ip.cidr} (${ip.description})` : ip.cidr} size="small" variant="outlined" />
              ))}
            </Stack>
          ) : (
            <Typography variant="body2">All connections allowed</Typography>
          )}
        </DetailRow>
      </Paper>

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 4, mb: 1.5, color: 'error.main' }}>
        Delete Server
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} sx={{ border: '1px solid', borderColor: 'error.main', borderRadius: 1, p: 3 }}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Delete this database server
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Permanently removes the server and all its data. This action cannot be undone.
          </Typography>
        </Box>
        <Button variant="outlined" color="error" startIcon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)} sx={{ flexShrink: 0 }}>
          Delete Server
        </Button>
      </Stack>

      {confirmDelete && <DeleteServerDialog server={service} isSubscribed={isSubscribed} variant={variant} onClose={() => setConfirmDelete(false)} onDeleted={onDeleted} onError={onError} />}
      {editing === 'maintenance' && <MaintenanceWindowDialog serverId={service.id} variant={variant} current={maintenance} onClose={() => setEditing(null)} onResult={onResult} />}
      {editing === 'ips' && <AllowedIpsDialog serverId={service.id} variant={variant} current={allowedIps} onClose={() => setEditing(null)} onResult={onResult} />}
    </Box>
  );
}
