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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Archive, Cpu, Download, Eye, EyeOff, HardDrive, MemoryStick, Power, RefreshCw, Server } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX, type ReactNode } from 'react';
import { useRevealDatabaseCredentials } from '../../hooks/useDatabases';
import { DATABASE_STATUS_COLORS, DATABASE_STATUS_LABELS, DATABASE_UNAVAILABLE } from '../../constants/databases';
import { caCertificateFileName, cpuLabel, memoryLabel, nodeDescription, planLabel } from '../../utils/databases';
import CopyField from './CopyField';
import DetailRow from './DetailRow';
import type { DatabaseCredentials, DatabaseServerDetail } from '../../types/databases';

const cardSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1 } as const;
const LABEL_WIDTH = 150;

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

function saveCaCertificate(databaseName: string, certificate: string): void {
  const url = URL.createObjectURL(new Blob([certificate], { type: 'application/x-pem-file' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = caCertificateFileName(databaseName);
  a.click();
  // Revoked on the next task: some browsers start the download only after
  // the click handler returns, and a revoked URL then saves nothing.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface OverviewTabProps {
  service: DatabaseServerDetail;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export default function OverviewTab({ service, onRefresh, isRefreshing }: OverviewTabProps): JSX.Element {
  const reveal = useRevealDatabaseCredentials(service.id);
  // The certificate comes from the same provider call as the credentials, but
  // through its own mutation so that downloading it never puts the credentials
  // on screen. The mutation is reset once the file is saved, so the password
  // that came with it is not kept either.
  const caFetch = useRevealDatabaseCredentials(service.id);
  const busy = reveal.isPending || caFetch.isPending;
  const [showPassword, setShowPassword] = useState(false);
  const [caError, setCaError] = useState(false);
  const credentials = reveal.data;

  // Reuses credentials already on screen; otherwise asks the provider once.
  const downloadCa = () => {
    setCaError(false);
    const pending: Promise<DatabaseCredentials> = credentials ? Promise.resolve(credentials) : caFetch.mutateAsync();
    pending
      .then((c) => {
        if (!c.caCertificate) throw new Error('no CA certificate');
        saveCaCertificate(service.name, c.caCertificate);
      })
      .catch(() => setCaError(true))
      .finally(() => caFetch.reset());
  };

  const hideCredentials = () => {
    reveal.reset();
    setShowPassword(false);
  };

  return (
    <Box>
      <Box sx={cardSx}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1} sx={{ px: 3, py: 1.5 }}>
          <Stack direction="row" alignItems="center" gap={2}>
            <Typography variant="body2" color="text.secondary" sx={{ width: LABEL_WIDTH }}>
              Status
            </Typography>
            <Chip label={DATABASE_STATUS_LABELS[service.status]} color={DATABASE_STATUS_COLORS[service.status]} size="small" variant="outlined" />
            {service.reconciling && (
              <Typography variant="caption" color="text.secondary">
                Applying changes…
              </Typography>
            )}
          </Stack>
          <Stack direction="row" alignItems="center" gap={0.5}>
            <Tooltip title="Refresh">
              <span>
                <IconButton size="small" aria-label="Refresh" onClick={onRefresh} disabled={isRefreshing}>
                  <RefreshCw size={16} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={DATABASE_UNAVAILABLE.power}>
              <span>
                <Button variant="outlined" size="small" startIcon={<Power size={16} />} disabled>
                  Power Off Service
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>

        <DetailRow label="Host:" labelWidth={LABEL_WIDTH}>
          {service.host ? <CopyField value={service.host} aria-label="host" /> : <Typography variant="body2">Not available yet</Typography>}
        </DetailRow>
        <DetailRow label="Port:" labelWidth={LABEL_WIDTH}>
          {service.port ? <CopyField value={service.port} aria-label="port" /> : <Typography variant="body2">Not available yet</Typography>}
        </DetailRow>
        {service.host && !service.reachable && (
          <Box sx={{ px: 3, pb: 1.5 }}>
            <Alert severity="warning">This database is not published, so integrations cannot reach this address. It is reachable only from inside the database platform.</Alert>
          </Box>
        )}

        {credentials ? (
          <>
            <DetailRow label="Admin User:" labelWidth={LABEL_WIDTH}>
              <CopyField value={credentials.username} aria-label="admin user" />
            </DetailRow>
            {credentials.database && (
              <DetailRow label="Default Database:" labelWidth={LABEL_WIDTH}>
                <CopyField value={credentials.database} aria-label="default database" />
              </DetailRow>
            )}
            <DetailRow
              label="Password:"
              labelWidth={LABEL_WIDTH}
              action={
                <Button size="small" onClick={hideCredentials}>
                  Hide credentials
                </Button>
              }>
              <CopyField
                value={credentials.password}
                aria-label="password"
                password={!showPassword}
                endAction={
                  <IconButton size="small" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)} edge="end">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </IconButton>
                }
              />
            </DetailRow>
          </>
        ) : (
          <DetailRow label="Credentials:" labelWidth={LABEL_WIDTH}>
            <Stack gap={0.5} alignItems="flex-start">
              <Button variant="outlined" size="small" startIcon={reveal.isPending ? <CircularProgress size={14} color="inherit" /> : <Eye size={16} />} disabled={busy || service.status !== 'ACTIVE'} onClick={() => reveal.mutate()}>
                View Credentials
              </Button>
              {reveal.isError && (
                <Typography variant="caption" color="error">
                  {reveal.error.message}
                </Typography>
              )}
            </Stack>
          </DetailRow>
        )}
        <DetailRow label="CA Certificate:" labelWidth={LABEL_WIDTH}>
          <Stack gap={0.5} alignItems="flex-start">
            <Button variant="outlined" size="small" startIcon={caFetch.isPending ? <CircularProgress size={14} color="inherit" /> : <Download size={16} />} disabled={busy || service.status !== 'ACTIVE'} onClick={downloadCa}>
              Download CA Certificate
            </Button>
            {caError && (
              <Typography variant="caption" color="error">
                Couldn&apos;t download the certificate. Try again.
              </Typography>
            )}
          </Stack>
        </DetailRow>
      </Box>

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 4, mb: 1.5 }}>
        Current Service Plan
      </Typography>
      <Box sx={{ ...cardSx, p: 3 }}>
        <Stack direction="row" flexWrap="wrap" gap={7} alignItems="flex-start">
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {service.plan ? planLabel(service.plan) : '—'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              PostgreSQL {service.runningVersion || service.postgresVersion}
            </Typography>
          </Box>
          {service.nodeCount !== undefined && (
            <PlanStat icon={<Server size={15} />} label="Nodes">
              {nodeDescription(service.nodeCount)}
            </PlanStat>
          )}
          {service.cpu && (
            <PlanStat icon={<Cpu size={15} />} label="CPU per node">
              {cpuLabel(service.cpu)}
            </PlanStat>
          )}
          {service.memory && (
            <PlanStat icon={<MemoryStick size={15} />} label="Memory per node">
              {memoryLabel(service.memory)}
            </PlanStat>
          )}
          {service.storageGi !== undefined && (
            <PlanStat icon={<HardDrive size={15} />} label="Storage">
              {service.storageGi} GB
            </PlanStat>
          )}
          <PlanStat icon={<Archive size={15} />} label="Backups">
            {service.backup?.enabled ? `Daily${service.backup.retentionDays ? `, kept ${service.backup.retentionDays} days` : ''}` : 'No automatic backups'}
          </PlanStat>
        </Stack>
      </Box>
    </Box>
  );
}
