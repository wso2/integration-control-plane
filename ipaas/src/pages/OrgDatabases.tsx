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

import { Alert, Button, IconButton, PageContent, PageTitle, Stack, Tooltip } from '@wso2/oxygen-ui';
import { Plus, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useDatabaseAvailability, useDatabaseOffering, useDatabaseServers } from '../hooks/useDatabases';
import { useTemporalOffering, useTemporalServers } from '../hooks/useTemporal';
import { databaseUrl, newDatabaseUrl, temporalUrl, type OrgScope } from '../nav';
import PlatformServicesTable, { type ServiceRow } from '../components/Databases/PlatformServicesTable';
import NoDatabaseServersBanner from '../components/Databases/NoDatabaseServersBanner';
import { DatabaseListSkeleton } from '../components/Databases/DatabaseSkeletons';
import type { DatabasePlan } from '../types/databases';
import type { TemporalPlan } from '../types/temporal';

const headerSx = { mb: 3 } as const;
const NO_DATABASE_PLANS: readonly DatabasePlan[] = [];
const NO_TEMPORAL_PLANS: readonly TemporalPlan[] = [];

export default function OrgDatabases(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  // Every service type is provisioned through the same provider, so one availability answers for all.
  const availability = useDatabaseAvailability();
  const available = availability.data?.available === true;
  const databases = useDatabaseServers(available);
  const temporals = useTemporalServers(available);
  // Describe each service's plan; until they load (or if they fail) the list shows plan names alone.
  const databaseOffering = useDatabaseOffering(available);
  const temporalOffering = useTemporalOffering(available);
  const lists = [databases, temporals];

  const rows: ServiceRow[] = [...(databases.data ?? []).map((server): ServiceRow => ({ kind: 'postgres', server })), ...(temporals.data ?? []).map((server): ServiceRow => ({ kind: 'temporal', server }))].sort((a, b) =>
    a.server.name.localeCompare(b.server.name),
  );

  const create = () => navigate(newDatabaseUrl(scope));
  const open = (row: ServiceRow) => navigate(row.kind === 'temporal' ? temporalUrl(scope, row.server.id) : databaseUrl(scope, row.server.id));
  const refresh = () => lists.forEach((q) => q.refetch());
  const retry = () => {
    availability.refetch();
    refresh();
  };
  const retryButton = (
    <Button color="inherit" size="small" onClick={retry}>
      Retry
    </Button>
  );
  // A failed poll keeps the last good data, so the list (and any delete dialog
  // open on it) stays up; a type that failed to load hides only its own rows.
  const failed = (availability.isError && !availability.data) || (available && lists.every((q) => q.isError && !q.data));
  const stale = !failed && (availability.isError || (available && lists.some((q) => q.isError)));

  const body = (): JSX.Element => {
    if (availability.isLoading || (available && lists.some((q) => q.isLoading))) return <DatabaseListSkeleton />;
    if (failed)
      return (
        <Alert severity="error" action={retryButton}>
          Failed to load services.
        </Alert>
      );
    if (!available) return <Alert severity="info">Platform services are not available in this environment.</Alert>;
    if (!rows.length) return <NoDatabaseServersBanner onCreate={create} />;
    return <PlatformServicesTable rows={rows} databasePlans={databaseOffering.data?.plans ?? NO_DATABASE_PLANS} temporalPlans={temporalOffering.data?.plans ?? NO_TEMPORAL_PLANS} onOpen={open} />;
  };

  return (
    <PageContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={headerSx}>
        <PageTitle>
          <PageTitle.Header>Platform Services</PageTitle.Header>
          <PageTitle.SubHeader>Managed services your integrations can connect to.</PageTitle.SubHeader>
        </PageTitle>
        {rows.length > 0 && (
          <Stack direction="row" alignItems="center" gap={1}>
            <Tooltip title="Refresh">
              <span>
                <IconButton size="small" aria-label="Refresh services" onClick={refresh} disabled={lists.some((q) => q.isFetching)}>
                  <RefreshCw size={16} />
                </IconButton>
              </span>
            </Tooltip>
            <Button variant="contained" startIcon={<Plus size={20} />} onClick={create} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              Create
            </Button>
          </Stack>
        )}
      </Stack>
      {stale && (
        <Alert severity="warning" action={retryButton} sx={{ mb: 2 }}>
          Couldn&apos;t load or refresh some services. Showing what loaded.
        </Alert>
      )}
      {body()}
    </PageContent>
  );
}
