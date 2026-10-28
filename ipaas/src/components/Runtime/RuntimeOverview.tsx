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

import { Alert, Box, Button, Chip, CircularProgress, Grid, Stack, Typography } from '@wso2/oxygen-ui';
import { RotateCw } from '@wso2/oxygen-ui-icons-react';
import { type JSX } from 'react';
import CopyField from './CopyField';
import { formatDistanceToNow } from '../../utils/time';
import type { PaletteColor } from '../../config/statusColors';

// Normalize whatever casing/format the backend sends (e.g. "Active", "ACTIVE",
// "IN_PROGRESS") so the chip is always coloured instead of falling back to grey.
function statusMeta(status: string): { label: string; color: PaletteColor } {
  switch ((status || '').replace(/[_\s]/g, '').toLowerCase()) {
    case 'active':
      return { label: 'Active', color: 'success' };
    case 'inprogress':
      return { label: 'In Progress', color: 'info' };
    case 'error':
    case 'failed':
    case 'failure':
      return { label: 'Error', color: 'error' };
    case 'suspended':
      return { label: 'Suspended', color: 'warning' };
    case 'notdeployed':
      return { label: 'Not Deployed', color: 'default' };
    default:
      return { label: status || 'Unknown', color: 'default' };
  }
}

interface RuntimeOverviewProps {
  componentName: string;
  status: string;
  lastDeployedAt?: string;
  componentId: string;
  releaseId: string;
  namespace?: string;
  imageUrl?: string;
  isDeployed: boolean;
  redeploying: boolean;
  canRedeploy: boolean;
  onRedeploy: () => void;
}

export default function RuntimeOverview({ componentName, status, lastDeployedAt, componentId, releaseId, namespace, imageUrl, isDeployed, redeploying, canRedeploy, onRedeploy }: RuntimeOverviewProps): JSX.Element {
  const meta = statusMeta(status);
  return (
    <Grid container spacing={4}>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {componentName}
          </Typography>
          <Chip size="small" variant="outlined" color={meta.color} label={meta.label} sx={{ height: 20, fontSize: '0.68rem', fontWeight: 500 }} />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Last deployed {lastDeployedAt ? formatDistanceToNow(lastDeployedAt) : '—'}
        </Typography>
        <Box sx={{ mt: 3 }}>
          {isDeployed ? (
            <Button variant="outlined" startIcon={redeploying ? <CircularProgress size={16} color="inherit" /> : <RotateCw size={18} />} disabled={redeploying || !canRedeploy} onClick={onRedeploy}>
              Redeploy Release
            </Button>
          ) : (
            <Alert severity="info">No release is currently deployed to this environment.</Alert>
          )}
        </Box>
      </Grid>
      <Grid size={{ xs: 12, lg: 8 }}>
        <CopyField label="Component ID" value={componentId} />
        <CopyField label="Release ID" value={releaseId} />
        <CopyField label="Namespace" value={namespace ?? ''} />
        <CopyField label="Image" value={imageUrl ?? ''} />
      </Grid>
    </Grid>
  );
}
