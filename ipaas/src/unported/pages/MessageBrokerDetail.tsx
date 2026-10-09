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

import { Alert, Box, Button, CircularProgress, ColorSchemeImage, PageContent, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { isPlatformServicesEnabled, useDatabaseServer } from '../hooks/usePlatformServices';
import { useSubscriptions } from '../../hooks/useSubscription';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { PAID_SUBSCRIPTION_TYPE } from '../../constants/subscription';
import { MESSAGE_BROKER_KIND, BROKER_SERVICE_TYPES, serviceTypeLabel, type ServiceTypeOption } from '../../constants/platformServices';
import ComingSoon from '../../pages/ComingSoon';
import BrokerOverviewTab from '../components/MessageBrokers/BrokerOverviewTab';
import TopicsTab from '../components/MessageBrokers/TopicsTab';
import UsersTab from '../components/MessageBrokers/UsersTab';
import AclTab from '../components/MessageBrokers/AclTab';
import LogsTab from '../components/Databases/detail/LogsTab';
import MetricsTab from '../components/Databases/detail/MetricsTab';
import AdvancedSettingsTab from '../components/Databases/detail/AdvancedSettingsTab';
import type { OrgScope } from '../../nav';

type DetailTab = 'overview' | 'topics' | 'users' | 'acl' | 'logs' | 'metrics' | 'advanced';

const TABS: { value: DetailTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'topics', label: 'Topics' },
  { value: 'users', label: 'Users' },
  { value: 'acl', label: 'Access Control' },
  { value: 'logs', label: 'Logs' },
  { value: 'metrics', label: 'Metrics' },
  { value: 'advanced', label: 'Advanced Settings' },
];

const logoFor = (type: string): ServiceTypeOption | undefined => BROKER_SERVICE_TYPES.find((t) => t.id === type);

export default function MessageBrokerDetail(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { brokerId = '', tab = 'overview' } = useParams();
  const base = `/organizations/${scope.org}/admin/message-brokers`;
  const orgUuid = useOrgUuid();
  const { data: service, isLoading, isError, refetch, isFetching } = useDatabaseServer(brokerId, 'brokers');
  const { data: subscriptions } = useSubscriptions(orgUuid ?? '');
  const isSubscribed = (subscriptions?.list ?? []).some((s) => s.subscriptionType === PAID_SUBSCRIPTION_TYPE);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isPlatformServicesEnabled()) {
    return <ComingSoon title="Coming Soon" description="Message Brokers management is currently under development." />;
  }

  const activeTab = (TABS.some((t) => t.value === tab) ? tab : 'overview') as DetailTab;
  const logo = service ? logoFor(service.type) : undefined;

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(base)} sx={{ mb: 2 }}>
        {MESSAGE_BROKER_KIND.backToDetailLabel}
      </Button>

      {notice && (
        <Alert severity="error" onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}

      {isLoading ? (
        <CircularProgress sx={{ display: 'block', mx: 'auto', py: 8 }} />
      ) : isError || !service ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load this message broker.
        </Alert>
      ) : (
        <>
          <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 3 }}>
            {logo ? (
              logo.logoDark ? (
                <ColorSchemeImage src={{ light: `${import.meta.env.BASE_URL}${logo.logo}`, dark: `${import.meta.env.BASE_URL}${logo.logoDark}` }} alt="" width={40} height={40} sx={{ flexShrink: 0 }} />
              ) : (
                <Box component="img" src={`${import.meta.env.BASE_URL}${logo.logo}`} alt="" sx={{ width: 40, height: 40, flexShrink: 0 }} />
              )
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

          <Tabs value={activeTab} onChange={(_, v) => navigate(`${base}/${brokerId}/${v}`)} sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 3 }}>
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
              {activeTab === 'overview' && <BrokerOverviewTab service={service} serverId={brokerId} onRefresh={() => refetch()} isRefreshing={isFetching} />}
              {activeTab === 'topics' && <TopicsTab brokerId={brokerId} />}
              {activeTab === 'users' && <UsersTab brokerId={brokerId} />}
              {activeTab === 'acl' && <AclTab brokerId={brokerId} />}
              {activeTab === 'logs' && <LogsTab serverId={brokerId} variant="brokers" />}
              {activeTab === 'metrics' && <MetricsTab serverId={brokerId} variant="brokers" />}
              {activeTab === 'advanced' && <AdvancedSettingsTab service={service} isSubscribed={isSubscribed} variant="brokers" onDeleted={() => navigate(base)} onError={setNotice} />}
            </>
          )}
        </>
      )}
    </PageContent>
  );
}
