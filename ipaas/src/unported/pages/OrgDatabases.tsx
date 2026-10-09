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

import { Alert, Box, Button, CircularProgress, IconButton, PageContent, PageTitle, Stack, Tooltip } from '@wso2/oxygen-ui';
import { Plus, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { isPlatformServicesEnabled, useDatabaseServers, useServiceAvailability } from '../hooks/usePlatformServices';
import { useSubscriptions } from '../../hooks/useSubscription';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { PAID_SUBSCRIPTION_TYPE } from '../../constants/subscription';
import { DATABASE_KIND, type DbServerKind } from '../../constants/platformServices';
import type { OrgScope } from '../../nav';
import ComingSoon from '../../pages/ComingSoon';
import DatabaseServersTable from '../components/Databases/DatabaseServersTable';
import NoDatabaseServersBanner from '../components/Databases/NoDatabaseServersBanner';
import type { DatabaseServer } from '../../types/platformServices';

/**
 * Shared list view for both the Databases and Vector Databases pages. The `kind`
 * descriptor supplies the title, routing segment, empty-state copy and the
 * `is_vector_enabled` filter — see {@link DbServerKind}.
 */
export function DatabaseServersListView({ scope, kind }: { scope: OrgScope; kind: DbServerKind }): JSX.Element {
  const navigate = useAppNavigate();
  const orgUuid = useOrgUuid();
  const availability = useServiceAvailability();
  const servers = useDatabaseServers(kind.variant);
  const { data: subscriptions } = useSubscriptions(orgUuid ?? '');
  const isSubscribed = (subscriptions?.list ?? []).some((s) => s.subscriptionType === PAID_SUBSCRIPTION_TYPE);
  const billingConsoleUrl = window.API_CONFIG?.billingConsoleUrl;
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const base = `/organizations/${scope.org}/admin/${kind.segment}`;

  // The db-servers list is shared org-wide between Databases and Vector Databases;
  // each page shows only its own flavour. Brokers arrive from their own endpoint.
  const kindServers = useMemo(() => (kind.variant === 'brokers' ? (servers.data ?? []) : (servers.data ?? []).filter((s) => (kind.isVector ? s.is_vector_enabled : !s.is_vector_enabled))), [servers.data, kind.isVector, kind.variant]);

  if (!isPlatformServicesEnabled()) {
    return <ComingSoon title="Coming Soon" description={`${kind.listTitle} management is currently under development.`} />;
  }

  const notAllowlisted = availability.data?.reason === 'ORGANIZATION_NOT_IN_ALLOW_LIST';
  const createAllowed = !!availability.data?.is_available && kindServers.length < (availability.data?.service_count_limit ?? 0);
  const upgradeRequired = availability.data?.reason === 'FREE_SUB_MAX_COUNT_EXCEEDED' || availability.data?.reason === 'FREE_TRIAL_EXPIRED';

  const openServer = (server: DatabaseServer) => navigate(`${base}/${server.id}/overview`);

  const createButton = (
    <Button variant="contained" startIcon={<Plus size={20} />} disabled={!createAllowed} onClick={() => navigate(`${base}/new`)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
      {upgradeRequired ? 'Upgrade required' : 'Create'}
    </Button>
  );

  return (
    <PageContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <PageTitle>
          <PageTitle.Header>{kind.listTitle}</PageTitle.Header>
        </PageTitle>
        {!!kindServers.length && (
          <Stack direction="row" alignItems="center" gap={1}>
            <Tooltip title="Refresh">
              <IconButton size="small" aria-label={`Refresh ${kind.listTitle}`} onClick={() => servers.refetch()} disabled={servers.isFetching}>
                <RefreshCw size={16} />
              </IconButton>
            </Tooltip>
            {createButton}
          </Stack>
        )}
      </Stack>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {servers.isLoading || availability.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : notAllowlisted ? (
        <Alert severity="info">This feature is only available for selected organizations in this environment.</Alert>
      ) : servers.isError || availability.isError ? (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                servers.refetch();
                availability.refetch();
              }}>
              Retry
            </Button>
          }>
          Failed to list available {kind.serverNoun} services.
        </Alert>
      ) : kind.requiresPaidPlan && !isSubscribed && kindServers.length === 0 ? (
        <Alert
          severity="info"
          action={
            billingConsoleUrl && orgUuid ? (
              <Button color="inherit" size="small" variant="outlined" onClick={() => window.open(`${billingConsoleUrl}/cloud/devant/upgrade?orgId=${encodeURIComponent(orgUuid)}`, '_blank', 'noopener,noreferrer')}>
                Upgrade
              </Button>
            ) : undefined
          }>
          {kind.listTitle} are available on paid plans. Upgrade your subscription to create a {kind.serverNoun}.
        </Alert>
      ) : kindServers.length === 0 ? (
        <NoDatabaseServersBanner createAllowed={createAllowed} upgradeRequired={upgradeRequired} headline={kind.emptyHeadline} body={kind.emptyBody} onCreate={() => navigate(`${base}/new`)} />
      ) : (
        <DatabaseServersTable
          servers={kindServers}
          isSubscribed={isSubscribed}
          variant={kind.variant}
          onOpenServer={openServer}
          onDeleted={(name) => setAlert({ type: 'success', message: `${kind.serverNoun.charAt(0).toUpperCase()}${kind.serverNoun.slice(1)} '${name}' deleted.` })}
          onError={(message) => setAlert({ type: 'error', message })}
        />
      )}
    </PageContent>
  );
}

export default function OrgDatabases(scope: OrgScope): JSX.Element {
  return <DatabaseServersListView scope={scope} kind={DATABASE_KIND} />;
}
