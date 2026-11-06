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

import { Box, Button, Paper, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Pencil, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { DATABASE_UNAVAILABLE } from '../../constants/databases';
import { nodeDescription } from '../../utils/databases';
import DeleteDatabaseDialog from './DeleteDatabaseDialog';
import DetailRow from './DetailRow';
import type { DatabaseServerDetail } from '../../types/databases';

const LABEL_WIDTH = 180;
const dangerZoneSx = { border: '1px solid', borderColor: 'error.main', borderRadius: 1, p: 3 } as const;

/** An Edit action the provider cannot carry out yet: shown, disabled, with the reason. */
function UnavailableEdit({ reason }: { reason: string }): JSX.Element {
  return (
    <Tooltip title={reason}>
      <span>
        <Button size="small" startIcon={<Pencil size={14} />} disabled>
          Edit
        </Button>
      </span>
    </Tooltip>
  );
}

export default function AdvancedSettingsTab({ service, onDeleted }: { service: DatabaseServerDetail; onDeleted: () => void }): JSX.Element {
  const [deleting, setDeleting] = useState(false);
  return (
    <Box>
      <Paper variant="outlined">
        <Typography variant="subtitle2" sx={{ fontWeight: 600, px: 3, py: 1.5 }}>
          Service Configuration
        </Typography>
        <DetailRow label="Service version" labelWidth={LABEL_WIDTH}>
          <Typography variant="body2">{service.runningVersion || service.postgresVersion || '—'}</Typography>
        </DetailRow>
        <DetailRow label="Maintenance window" labelWidth={LABEL_WIDTH} action={<UnavailableEdit reason={DATABASE_UNAVAILABLE.maintenance} />}>
          <Typography variant="body2">Not scheduled</Typography>
        </DetailRow>
        <DetailRow label="Nodes" labelWidth={LABEL_WIDTH}>
          <Typography variant="body2">{service.nodeCount !== undefined ? nodeDescription(service.nodeCount) : '—'}</Typography>
        </DetailRow>
        <DetailRow label="Allowed IP addresses" labelWidth={LABEL_WIDTH} action={<UnavailableEdit reason={DATABASE_UNAVAILABLE.allowedIps} />}>
          {/* A published database accepts connections from anywhere; the password is the only control. */}
          <Typography variant="body2">{service.reachable ? 'All connections allowed' : 'Not published'}</Typography>
        </DetailRow>
      </Paper>

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 4, mb: 1.5, color: 'error.main' }}>
        Delete Server
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} sx={dangerZoneSx}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Delete this database server
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Permanently removes the server, all its data and its backups. This action cannot be undone.
          </Typography>
        </Box>
        <Button variant="outlined" color="error" startIcon={<Trash2 size={16} />} onClick={() => setDeleting(true)} sx={{ flexShrink: 0 }}>
          Delete Server
        </Button>
      </Stack>
      {deleting && <DeleteDatabaseDialog server={service} onClose={() => setDeleting(false)} onDeleted={onDeleted} />}
    </Box>
  );
}
