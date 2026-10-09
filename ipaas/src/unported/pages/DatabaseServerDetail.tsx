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

import { Alert, Box, Button, CircularProgress, PageContent, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { isPlatformServicesEnabled, useDatabaseServer } from '../hooks/usePlatformServices';
import { useSubscriptions } from '../../hooks/useSubscription';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { PAID_SUBSCRIPTION_TYPE } from '../../constants/subscription';
import { DATABASE_KIND, SERVICE_TYPES, serviceTypeLabel, type DbServerKind } from '../../constants/platformServices';
import ComingSoon from '../../pages/ComingSoon';
import OverviewTab from '../components/Databases/detail/OverviewTab';
import MetricsTab from '../components/Databases/detail/MetricsTab';
import DatabasesTab from '../components/Databases/detail/DatabasesTab';
import LogsTab from '../components/Databases/detail/LogsTab';
import BackupsTab from '../components/Databases/detail/BackupsTab';
import AdvancedSettingsTab from '../components/Databases/detail/AdvancedSettingsTab';
import type { OrgScope } from '../../nav';

type DetailTab = 'overview' | 'databases' | 'logs' | 'metrics' | 'backups' | 'advanced';

const TABS: { value: DetailTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'databases', label: 'Databases' },
  { value: 'logs', label: 'Logs' },
  { value: 'metrics', label: 'Metrics' },
  { value: 'backups', label: 'Backups' },
  { value: 'advanced', label: 'Advanced Settings' },
];

const logoFor = (type: string): string | undefined => SERVICE_TYPES.find((t) => t.id === type)?.logo;

/** Shared detail/management view for both Databases and Vector Databases. */
export function DatabaseServerDetailView({ scope, kind }: { scope: OrgScope; kind: DbServerKind }): JSX.Element {
  const navigate = useAppNavigate();
  const { dbServerId = '', tab = 'overview' } = useParams();
  const base = `/organizations/${scope.org}/admin/${kind.segment}`;
  const orgUuid = useOrgUuid();
  const { data: service, isLoading, isError, refetch, isFetching } = useDatabaseServer(dbServerId);
  const { data: subscriptions } = useSubscriptions(orgUuid ?? '');
  const isSubscribed = (subscriptions?.list ?? []).some((s) => s.subscriptionType === PAID_SUBSCRIPTION_TYPE);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isPlatformServicesEnabled()) {
    return <ComingSoon title="Coming Soon" description={`${kind.listTitle} management is currently under development.`} />;
  }

  const activeTab = (TABS.some((t) => t.value === tab) ? tab : 'overview') as DetailTab;
  const logo = service ? logoFor(service.type) : undefined;

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(base)} sx={{ mb: 2 }}>
        {kind.backToDetailLabel}
      </Button>

      {notice && (
        <Alert severity="error" onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : isError || !service ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load this database server.
        </Alert>
      ) : (
        <>
          <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 3 }}>
            {logo ? (
              <Box component="img" src={`${import.meta.env.BASE_URL}${logo}`} alt="" sx={{ width: 40, height: 40, flexShrink: 0 }} />
            ) : (
              <Box sx={{ width: 40, height: 40, borderRadius: 1, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, textTransform: 'uppercase' }}>{service.name.charAt(0) || '?'}</Box>
            )}
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {service.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {serviceTypeLabel(service.type)}
              </Typography>
            </Box>
          </Stack>

          <Tabs value={activeTab} onChange={(_, v) => navigate(`${base}/${dbServerId}/${v}`)} sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 3 }}>
            {TABS.map((t) => (
              <Tab key={t.value} value={t.value} label={t.label} />
            ))}
          </Tabs>

          {service.status === 'CREATING' ? (
            <Alert severity="info">
              This service is being created. Please wait.
              <br />
              Some features and settings will be disabled until this service is active.
            </Alert>
          ) : (
            <>
              {activeTab === 'overview' && <OverviewTab service={service} serverId={dbServerId} onRefresh={() => refetch()} isRefreshing={isFetching} />}
              {activeTab === 'databases' && <DatabasesTab service={service} orgHandle={scope.org} />}
              {activeTab === 'logs' && <LogsTab serverId={dbServerId} />}
              {activeTab === 'metrics' && <MetricsTab serverId={dbServerId} />}
              {activeTab === 'backups' && <BackupsTab serverId={dbServerId} />}
              {activeTab === 'advanced' && <AdvancedSettingsTab service={service} isSubscribed={isSubscribed} onDeleted={() => navigate(base)} onError={setNotice} />}
            </>
          )}
        </>
      )}
    </PageContent>
  );
}

export default function DatabaseServerDetail(scope: OrgScope): JSX.Element {
  return <DatabaseServerDetailView scope={scope} kind={DATABASE_KIND} />;
}
