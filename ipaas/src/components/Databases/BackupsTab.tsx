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

import { Alert, AlertTitle, Button, CircularProgress, Skeleton, Stack } from '@wso2/oxygen-ui';
import { Archive } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useDatabaseOffering, useEnableDatabaseBackups } from '../../hooks/useDatabases';
import { databaseBackupView } from '../../utils/databases';
import { formatDateTime } from '../../utils/time';
import type { DatabaseServerDetail } from '../../types/databases';

// The retention the BFF enables backups with; shown before enabling, when the
// database has no policy to read it from yet.
const ENABLED_RETENTION_DAYS = 7;

export default function BackupsTab({ service }: { service: DatabaseServerDetail }): JSX.Element {
  const offering = useDatabaseOffering();
  const enable = useEnableDatabaseBackups(service.id);
  const plan = offering.data?.plans.find((p) => p.id === service.plan);
  const view = databaseBackupView(service, plan?.backups, enable.isSuccess);

  switch (view.kind) {
    case 'notOffered':
      return (
        <Alert severity="info">
          <AlertTitle>Backups are not available on this plan</AlertTitle>
          This database&apos;s plan does not include backups.
        </Alert>
      );

    case 'enabling':
      return (
        <Alert severity="info" icon={<CircularProgress size={18} color="inherit" />}>
          <AlertTitle>Enabling backups</AlertTitle>
          This takes a moment. The page updates on its own.
        </Alert>
      );

    case 'on': {
      const kept = view.retentionDays ? ` and kept for ${view.retentionDays} days` : '';
      const last = view.lastBackupAt ? ` The last backup finished ${formatDateTime(view.lastBackupAt)}.` : '';
      if (view.health === 'failing')
        return (
          <Alert severity="warning">
            <AlertTitle>Backups are enabled but not completing</AlertTitle>
            Backups are scheduled daily{kept}, but the latest one did not finish.{last} Contact support if this persists.
          </Alert>
        );
      if (view.health === 'starting')
        return (
          <Alert severity="success">
            <AlertTitle>Backups are enabled</AlertTitle>
            Backups run daily{kept}. The first backup is in progress.
          </Alert>
        );
      return (
        <Alert severity="success">
          <AlertTitle>Backups are enabled</AlertTitle>
          Backups run daily{kept}.{last}
        </Alert>
      );
    }

    case 'off':
      // "Off" offers enabling, which is only right once the plan is known to include backups.
      if (!plan) {
        if (offering.isLoading) return <Skeleton variant="rounded" height={72} aria-label="Loading backups" />;
        return (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => offering.refetch()}>
                Retry
              </Button>
            }>
            Couldn&apos;t check whether this database&apos;s plan includes backups.
          </Alert>
        );
      }
      return (
        <Stack gap={2}>
          <Alert
            severity="warning"
            action={
              <Button color="inherit" size="small" startIcon={enable.isPending ? <CircularProgress size={14} color="inherit" /> : <Archive size={16} />} disabled={enable.isPending || service.status !== 'ACTIVE'} onClick={() => enable.mutate()}>
                Enable Backups
              </Button>
            }>
            <AlertTitle>Backups are not enabled</AlertTitle>
            Enable daily backups to keep this database recoverable to any point in the last {ENABLED_RETENTION_DAYS} days.
          </Alert>
          {enable.isError && (
            <Alert severity="error" onClose={() => enable.reset()}>
              {enable.error.message}
            </Alert>
          )}
        </Stack>
      );
  }
}
