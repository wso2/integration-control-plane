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

import { Alert, Box, Button, PageContent, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useDatabaseServer } from '../hooks/useDatabases';
import { isNotFoundError } from '../utils/apiErrors';
import { DATABASE_UNAVAILABLE, POSTGRES_LOGO } from '../constants/databases';
import { databaseUrl, orgDatabasesUrl, type OrgScope } from '../nav';
import PageNotFound from './PageNotFound';
import OverviewTab from '../components/Databases/OverviewTab';
import BackupsTab from '../components/Databases/BackupsTab';
import AdvancedSettingsTab from '../components/Databases/AdvancedSettingsTab';
import UnavailablePanel from '../components/Databases/UnavailablePanel';
import { DatabaseDetailSkeleton } from '../components/Databases/DatabaseSkeletons';
import type { DatabaseServerDetail as Detail } from '../types/databases';

type DetailTab = 'overview' | 'databases' | 'logs' | 'metrics' | 'backups' | 'advanced';

const TABS: { value: DetailTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'databases', label: 'Databases' },
  { value: 'logs', label: 'Logs' },
  { value: 'metrics', label: 'Metrics' },
  { value: 'backups', label: 'Backups' },
  { value: 'advanced', label: 'Advanced Settings' },
];

const tabsSx = { borderBottom: '1px solid', borderColor: 'divider', mb: 3 } as const;
const logoSx = { width: 40, height: 40, flexShrink: 0 } as const;

function TabContent({ tab, service, onRefresh, isRefreshing, onDeleted }: { tab: DetailTab; service: Detail; onRefresh: () => void; isRefreshing: boolean; onDeleted: () => void }): JSX.Element {
  switch (tab) {
    case 'overview':
      return <OverviewTab service={service} onRefresh={onRefresh} isRefreshing={isRefreshing} />;
    case 'databases':
      return <UnavailablePanel title="Databases and credentials" description={DATABASE_UNAVAILABLE.logicalDatabases} />;
    case 'logs':
      return <UnavailablePanel title="Logs" description={DATABASE_UNAVAILABLE.logs} />;
    case 'metrics':
      return <UnavailablePanel title="Metrics" description={DATABASE_UNAVAILABLE.metrics} />;
    case 'backups':
      return <BackupsTab service={service} />;
    case 'advanced':
      return <AdvancedSettingsTab service={service} onDeleted={onDeleted} />;
  }
}

export default function DatabaseServerDetail(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { dbServerId = '', tab = 'overview' } = useParams();
  const { data: service, isLoading, isError, error, refetch, isFetching } = useDatabaseServer(dbServerId);
  const activeTab: DetailTab = TABS.find((t) => t.value === tab)?.value ?? 'overview';

  const backButton = (
    <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(orgDatabasesUrl(scope))} sx={{ mb: 2 }}>
      Back to Platform Services
    </Button>
  );

  if (isLoading)
    return (
      <PageContent>
        {backButton}
        <DatabaseDetailSkeleton />
      </PageContent>
    );
  if (isError && isNotFoundError(error)) return <PageNotFound title="Database not found" description="This database does not exist, or it belongs to another organization." actionTo={orgDatabasesUrl(scope)} actionLabel="Go to Platform Services" />;
  // A failed poll keeps the last good data; only a first load that failed has nothing to show.
  if (!service)
    return (
      <PageContent>
        {backButton}
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load this database.
        </Alert>
      </PageContent>
    );

  return (
    <PageContent>
      {backButton}

      {/* The page stays up on a failed poll so open dialogs and in-flight actions survive it. */}
      {isError && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Couldn&apos;t refresh this database. Showing the last loaded details.
        </Alert>
      )}

      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <Box component="img" src={`${import.meta.env.BASE_URL}${POSTGRES_LOGO}`} alt="" sx={logoSx} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {service.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            PostgreSQL {service.runningVersion || service.postgresVersion}
          </Typography>
        </Box>
      </Stack>

      <Tabs value={activeTab} onChange={(_, v: DetailTab) => navigate(databaseUrl(scope, dbServerId, v))} sx={tabsSx}>
        {TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {service.status === 'ERROR' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {service.statusMessage || 'This database has failed.'}
        </Alert>
      )}

      {service.status === 'CREATING' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This database is being created. This usually takes a few minutes.
          <br />
          Some features and settings will be disabled until it is active.
        </Alert>
      )}
      {/* Advanced Settings stays reachable while creating: it is where a create that hangs gets deleted. */}
      {(service.status !== 'CREATING' || activeTab === 'advanced') && <TabContent tab={activeTab} service={service} onRefresh={() => refetch()} isRefreshing={isFetching} onDeleted={() => navigate(orgDatabasesUrl(scope))} />}
    </PageContent>
  );
}
