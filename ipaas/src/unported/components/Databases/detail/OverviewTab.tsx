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

import { Box, Button, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Archive, Cloud, Cpu, Download, Eye, EyeOff, HardDrive, MemoryStick, Power, RefreshCw, Server } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactNode } from 'react';
import { useFetchServerCaCertificate, useServerAdminUser, useSetServerPoweredState } from '../../../hooks/usePlatformServices';
import { providerLabel, regionLabel, STATUS_COLORS, statusLabel, TRANSITIONAL_STATUSES } from '../../../../constants/platformServices';
import CopyField from './CopyField';
import DetailRow from './DetailRow';
import type { DatabaseServerDetail } from '../../../../types/platformServices';

function PlanStat({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }): JSX.Element {
  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={0.75} sx={{ color: 'text.secondary', mb: 0.5 }}>
        {icon}
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
}

export default function OverviewTab({ service, serverId, onRefresh, isRefreshing }: { service: DatabaseServerDetail; serverId: string; onRefresh: () => void; isRefreshing: boolean }): JSX.Element {
  const cp = service.connection_params;
  const plan = service.service_plan;
  const showDefaultDb = service.type === 'postgres' || service.type === 'mysql';
  const isActive = service.status === 'ACTIVE';
  const transitioning = TRANSITIONAL_STATUSES.includes(service.status);

  const power = useSetServerPoweredState(serverId);
  const [reveal, setReveal] = useState(false);
  const admin = useServerAdminUser(serverId, reveal);
  const fetchCa = useFetchServerCaCertificate(serverId);
  const [caError, setCaError] = useState(false);

  const nodeDesc = plan.node_count > 1 ? `${plan.node_count}x node high-availability set` : '1x node (not highly available)';

  const downloadCa = () => {
    setCaError(false);
    fetchCa()
      .then((c) => {
        const blob = new Blob([c.certificate], { type: 'application/x-pem-file' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${service.name}-ca.pem`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setCaError(true));
  };

  return (
    <Box>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1} sx={{ px: 3, py: 1.5 }}>
          <Stack direction="row" alignItems="center" gap={2}>
            <Typography variant="body2" color="text.secondary" sx={{ width: 150 }}>
              Status
            </Typography>
            <Chip label={statusLabel(service.status)} color={STATUS_COLORS[service.status]} size="small" variant="outlined" />
          </Stack>
          <Stack direction="row" alignItems="center" gap={0.5}>
            <Tooltip title="Refresh">
              <IconButton size="small" aria-label="Refresh" onClick={onRefresh} disabled={isRefreshing}>
                <RefreshCw size={16} />
              </IconButton>
            </Tooltip>
            <Button variant="outlined" size="small" startIcon={power.isPending ? <CircularProgress size={14} color="inherit" /> : <Power size={16} />} disabled={transitioning || power.isPending} onClick={() => power.mutate(!isActive)}>
              {isActive ? 'Power Off Service' : 'Power On Service'}
            </Button>
          </Stack>
        </Stack>

        <DetailRow label="Host:" labelWidth={150}>
          <CopyField value={cp.host} aria-label="host" />
        </DetailRow>
        <DetailRow label="Port:" labelWidth={150}>
          <CopyField value={cp.port} aria-label="port" />
        </DetailRow>
        <DetailRow label="Default User:" labelWidth={150}>
          <CopyField value={cp.user} aria-label="default user" />
        </DetailRow>
        {showDefaultDb && (
          <DetailRow label="Default Database:" labelWidth={150}>
            <CopyField value={cp.database} aria-label="default database" />
          </DetailRow>
        )}
        <DetailRow label="Password:" labelWidth={150}>
          {reveal ? (
            admin.isLoading ? (
              <CircularProgress size={18} />
            ) : admin.data ? (
              <CopyField
                value={admin.data.password}
                aria-label="password"
                endAction={
                  <IconButton size="small" aria-label="Hide password" onClick={() => setReveal(false)} edge="end">
                    <EyeOff size={15} />
                  </IconButton>
                }
              />
            ) : (
              <Typography variant="body2" color="error">
                Couldn&apos;t load the password.
              </Typography>
            )
          ) : (
            <Button variant="outlined" size="small" startIcon={<Eye size={16} />} onClick={() => setReveal(true)}>
              View Password
            </Button>
          )}
        </DetailRow>
        <DetailRow label="CA Certificate:" labelWidth={150}>
          <Stack gap={0.5}>
            <Box>
              <Button variant="outlined" size="small" startIcon={<Download size={16} />} onClick={downloadCa}>
                Download CA Certificate
              </Button>
            </Box>
            {caError && (
              <Typography variant="caption" color="error">
                Couldn&apos;t download the certificate. Please try again.
              </Typography>
            )}
          </Stack>
        </DetailRow>
      </Box>

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 4, mb: 1.5 }}>
        Current Service Plan
      </Typography>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 }}>
        <Stack direction="row" flexWrap="wrap" gap={7} alignItems="flex-start">
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {plan.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ${plan.hourly_price_usd}/hour
            </Typography>
          </Box>
          <PlanStat icon={<Cloud size={15} />} label="Cloud Provider">
            {providerLabel(service.cloud_provider)} • {regionLabel(service.cloud_region)}
          </PlanStat>
          <PlanStat icon={<Server size={15} />} label="Nodes">
            {nodeDesc}
          </PlanStat>
          <PlanStat icon={<Cpu size={15} />} label="CPU">
            {plan.node_cpu_count}
          </PlanStat>
          <PlanStat icon={<MemoryStick size={15} />} label="Memory">
            {plan.node_ram_gb} GB
          </PlanStat>
          {service.type !== 'redis' && (
            <PlanStat icon={<HardDrive size={15} />} label="Storage">
              {plan.storage_gb} GB
            </PlanStat>
          )}
          <PlanStat icon={<Archive size={15} />} label="Backups">
            {plan.backup_retention_days > 0 ? `Every ${plan.backup_interval_hours}h, kept ${plan.backup_retention_days}d` : 'No automatic backups'}
          </PlanStat>
        </Stack>
      </Box>
    </Box>
  );
}
