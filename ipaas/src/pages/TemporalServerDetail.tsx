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
import { ArrowLeft, Trash2, Workflow } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useTemporalOffering, useTemporalServer } from '../hooks/useTemporal';
import { isNotFoundError } from '../utils/apiErrors';
import { orgDatabasesUrl, temporalUrl, type OrgScope } from '../nav';
import PageNotFound from './PageNotFound';
import TemporalOverviewTab from '../components/Temporal/TemporalOverviewTab';
import DeleteTemporalDialog from '../components/Temporal/DeleteTemporalDialog';
import { DatabaseDetailSkeleton } from '../components/Databases/DatabaseSkeletons';
import type { TemporalServerDetail as Detail } from '../types/temporal';

type DetailTab = 'overview' | 'advanced';

const TABS: { value: DetailTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'advanced', label: 'Advanced Settings' },
];

const tabsSx = { borderBottom: '1px solid', borderColor: 'divider', mb: 3 } as const;
const logoSx = { width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' } as const;
const dangerZoneSx = { border: '1px solid', borderColor: 'error.main', borderRadius: 1, p: 3 } as const;

function AdvancedSettings({ service, onDeleted }: { service: Detail; onDeleted: () => void }): JSX.Element {
  const [deleting, setDeleting] = useState(false);
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5, color: 'error.main' }}>
        Delete Server
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} sx={dangerZoneSx}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Delete this Temporal server
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Permanently removes the server, its namespaces and all workflow history. This action cannot be undone.
          </Typography>
        </Box>
        <Button variant="outlined" color="error" startIcon={<Trash2 size={16} />} onClick={() => setDeleting(true)} sx={{ flexShrink: 0 }}>
          Delete Server
        </Button>
      </Stack>
      {deleting && <DeleteTemporalDialog server={service} onClose={() => setDeleting(false)} onDeleted={onDeleted} />}
    </Box>
  );
}

export default function TemporalServerDetail(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { temporalId = '', tab = 'overview' } = useParams();
  const { data: service, isLoading, isError, error, refetch, isFetching } = useTemporalServer(temporalId);
  // Describes the server's plan; until it loads (or if it fails) the plan shows by name alone.
  const offering = useTemporalOffering();
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
  if (isError && isNotFoundError(error))
    return <PageNotFound title="Temporal server not found" description="This Temporal server does not exist, or it belongs to another organization." actionTo={orgDatabasesUrl(scope)} actionLabel="Go to Platform Services" />;
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
          Failed to load this Temporal server.
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
          Couldn&apos;t refresh this Temporal server. Showing the last loaded details.
        </Alert>
      )}

      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <Box sx={logoSx}>
          <Workflow size={32} />
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {service.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {service.runningVersion ? `Temporal ${service.runningVersion}` : 'Temporal'}
          </Typography>
        </Box>
      </Stack>

      <Tabs value={activeTab} onChange={(_, v: DetailTab) => navigate(temporalUrl(scope, temporalId, v))} sx={tabsSx}>
        {TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {service.status === 'ERROR' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {service.statusMessage || 'This Temporal server has failed.'}
        </Alert>
      )}

      {service.status === 'CREATING' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This Temporal server is being created. This usually takes a few minutes.
          <br />
          Its address and API key will be available once it is active.
        </Alert>
      )}
      {/* Advanced Settings stays reachable while creating: it is where a create that hangs gets deleted. */}
      {activeTab !== 'overview' ? (
        <AdvancedSettings service={service} onDeleted={() => navigate(orgDatabasesUrl(scope))} />
      ) : (
        service.status !== 'CREATING' && <TemporalOverviewTab service={service} plan={offering.data?.plans.find((p) => p.id === service.plan)} onRefresh={() => refetch()} isRefreshing={isFetching} />
      )}
    </PageContent>
  );
}
