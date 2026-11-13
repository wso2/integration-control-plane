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

import { Alert, Avatar, Box, Button, Chip, CircularProgress, IconButton, ListingTable, PageContent, PageTitle, Stack, Tooltip, Typography, RelativeTime } from '@wso2/oxygen-ui';
import { Network, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import EmptyListing from '../components/EmptyListing';
import PdpProgressDrawer from '../components/DataPlanes/PdpProgressDrawer';
import { displayPdpProgress, pdpStatusChip } from '../constants/dataPlanes';
import { useDataPlanes, usePdps } from '../hooks/useDataPlanes';
import { formatDateTime, formatDistanceToNow } from '../utils/time';
import type { Cluster, PdpManagerPdp } from '../types/dataPlanes';
import type { OrgScope } from '../nav';

function NameCell({ name }: { name: string }): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" gap={1.5}>
      <Avatar sx={{ width: 24, height: 24, fontSize: 12, bgcolor: 'action.hover', color: 'text.primary' }}>{name[0]?.toUpperCase()}</Avatar>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {name}
      </Typography>
    </Stack>
  );
}

function RegisteredTimeCell({ date }: { date?: string }): JSX.Element {
  const isValidDate = !!date && !Number.isNaN(new Date(date).getTime());
  if (!isValidDate)
    return (
      <Typography variant="body2" component="span" color="text.secondary">
        {'—'}
      </Typography>
    );
  return <RelativeTime time={formatDistanceToNow(date)} dateTime={date} tooltip={formatDateTime(date)} />;
}

export default function OrgDataPlanes(_scope: OrgScope): JSX.Element {
  const { data: clusters, isLoading, isFetching, isError, refetch } = useDataPlanes();
  const { data: pdps, refetch: refetchPdps } = usePdps();
  const [progressPdp, setProgressPdp] = useState<string | null>(null);

  // A provisioning/failed PDP is shown as a pending row, not as a cluster; a ready
  // cluster supersedes its PDP row.
  const rowClusters = useMemo<Cluster[]>(() => {
    return (clusters ?? []).filter((dp) => {
      const match = (pdps ?? []).find((p) => p.name === dp.name);
      return !match || (match.creationStatus !== 'IN_PROGRESS' && match.creationStatus !== 'FAILURE');
    });
  }, [clusters, pdps]);

  const rowPdps = useMemo<PdpManagerPdp[]>(() => {
    return (pdps ?? [])
      .filter((pdp) => {
        const hasReadyCluster = (clusters ?? []).some((dp) => dp.name === pdp.name);
        return !hasReadyCluster || pdp.creationStatus !== 'SUCCESS';
      })
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [clusters, pdps]);

  const hasPdpInFlight = (pdps ?? []).some((p) => p.creationStatus === 'IN_PROGRESS' || p.creationStatus === 'PENDING');
  const isEmpty = !rowClusters.length && !rowPdps.length;

  const refresh = () => {
    refetch();
    refetchPdps();
  };

  return (
    <PageContent fullWidth>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <PageTitle>
          <PageTitle.Header>Data planes</PageTitle.Header>
        </PageTitle>
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" aria-label="Refresh" onClick={refresh} disabled={isFetching}>
              <RefreshCw size={18} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {isLoading || (isFetching && !clusters?.length && !pdps?.length) ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load data planes.
        </Alert>
      ) : isEmpty ? (
        <EmptyListing icon={<Network size={48} />} title="No data planes yet" description="Data planes will appear here once available for your organization." report={{ resource: 'data-planes', state: 'no-data' }} />
      ) : (
        <>
          {hasPdpInFlight && (
            <Alert severity="info" sx={{ mb: 2 }}>
              A new private data plane is being provisioned. This may take up to an hour — you can leave this page and check back anytime.
            </Alert>
          )}
          <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <ListingTable size="small">
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Name</ListingTable.Cell>
                  <ListingTable.Cell>Type</ListingTable.Cell>
                  <ListingTable.Cell>Status</ListingTable.Cell>
                  <ListingTable.Cell align="right">Registered time</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {rowPdps.map((pdp) => {
                  const chip = pdpStatusChip(pdp.creationStatus);
                  const progress = displayPdpProgress(pdp.creationProgress);
                  return (
                    <ListingTable.Row key={`pdp-${pdp.name}`}>
                      <ListingTable.Cell>
                        <NameCell name={pdp.name} />
                      </ListingTable.Cell>
                      <ListingTable.Cell>Private data plane</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Chip size="small" variant="outlined" color={chip.color} label={pdp.creationStatus === 'IN_PROGRESS' ? `${chip.label} · ${progress}%` : chip.label} />
                          {pdp.creationStatus === 'IN_PROGRESS' && (
                            <Button size="small" variant="text" onClick={() => setProgressPdp(pdp.name)}>
                              View progress
                            </Button>
                          )}
                        </Stack>
                      </ListingTable.Cell>
                      <ListingTable.Cell align="right">
                        <RegisteredTimeCell date={pdp.createdAt} />
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  );
                })}
                {rowClusters.map((dp) => {
                  const isPrivate = dp.labels?.private === true;
                  return (
                    <ListingTable.Row key={`dp-${dp.id}`}>
                      <ListingTable.Cell>
                        <NameCell name={dp.name} />
                      </ListingTable.Cell>
                      <ListingTable.Cell>{isPrivate ? 'Private data plane' : 'WSO2 Cloud data plane'}</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Chip size="small" variant="outlined" color={dp.isActive ? 'success' : 'error'} label={dp.isActive ? 'Active' : 'Disconnected'} />
                      </ListingTable.Cell>
                      <ListingTable.Cell align="right">
                        <RegisteredTimeCell date={isPrivate ? dp.createdOn : undefined} />
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  );
                })}
              </ListingTable.Body>
            </ListingTable>
          </ListingTable.Container>
        </>
      )}

      <PdpProgressDrawer open={progressPdp !== null} pdpName={progressPdp} onClose={() => setProgressPdp(null)} />
    </PageContent>
  );
}
