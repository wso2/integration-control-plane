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

import { Alert, Box, Button, CircularProgress, ListingTable, MenuItem, PageContent, Select, Switch, Typography } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useState, type JSX } from 'react';
import DeploymentTrackBar from '../../components/DeploymentTrackBar';
import NotFound from '../../components/NotFound';
import { useComponentByHandler, useComponentEndpoints } from '../../hooks/useComponents';
import { useProject, useProjectByHandler, useProjects } from '../../hooks/useProjects';
import { useApimApi, useUpdateApimApi } from '../../hooks/useApim';
import { useThrottlingPolicies } from '../../hooks/useMarketplace';
import { broaden, resourceUrl, type ComponentScope } from '../../nav';
import { UUID_RE } from '../../utils/string';
import type { ThrottlingPolicy } from '../../types/marketplace';
import type { DeploymentTrack } from '../../types/component';
import { PILL_SELECT_SX } from '../../constants/styles';

function getMajorVersion(apiVersion: string): string {
  return apiVersion.replace(/^v/i, '').split('.')[0];
}

function aggregateByMajorVersion(tracks: DeploymentTrack[]): DeploymentTrack[] {
  const groups = new Map<string, DeploymentTrack>();
  for (const track of tracks) {
    if (!track.apiVersion) {
      groups.set(track.id, track);
      continue;
    }
    const key = `${getMajorVersion(track.apiVersion)}.x`;
    const existing = groups.get(key);
    if (!existing || track.latest) {
      groups.set(key, { ...track, apiVersion: key });
    }
  }
  return Array.from(groups.values());
}

function formatQuota(policy: ThrottlingPolicy): string {
  if (policy.requestCount === -1 || policy.requestCount === 0) return 'N/A';
  return `${policy.requestCount} / ${policy.timeUnit ?? 'min'}`;
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 1.5,
        py: 0.25,
        border: '1px solid',
        borderColor: enabled ? 'success.main' : 'divider',
        borderRadius: 0.5,
        color: enabled ? 'success.main' : 'text.secondary',
        fontSize: '0.75rem',
        fontWeight: 500,
        minWidth: 72,
      }}>
      {enabled ? 'Enabled' : 'Disabled'}
    </Box>
  );
}

export default function ComponentPlans(scope: ComponentScope): JSX.Element {
  const isUuid = UUID_RE.test(scope.project);
  const { data: projectByHandler, isLoading: loadingByHandler } = useProjectByHandler(!isUuid ? scope.project : '');
  const { data: projectById, isLoading: loadingById } = useProject(isUuid ? scope.project : '');
  const { data: allProjects = [], isLoading: loadingProjects } = useProjects();
  const projectFromList = !isUuid ? (allProjects.find((p) => p.handler === scope.project) ?? null) : null;
  const project = projectByHandler ?? projectById ?? projectFromList;
  const loadingProject = !project && (isUuid ? loadingById : loadingByHandler || loadingProjects);

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(project?.id ?? '', scope.component);
  const isLoading = loadingProject || loadingComponent;

  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  const aggregatedTracks = useMemo(() => aggregateByMajorVersion(tracks), [tracks]);
  // Derived rather than synced via an effect — an effect+render round trip here would delay
  // useComponentEndpoints/useApimApi below from becoming enabled. Falls back to the latest
  // track/first endpoint whenever the current selection isn't valid for the current list.
  const [selectedTrackIdState, setSelectedTrackId] = useState('');
  const selectedTrackId = tracks.some((t) => t.id === selectedTrackIdState) ? selectedTrackIdState : (tracks.find((t) => t.latest)?.id ?? tracks[0]?.id ?? '');

  const { data: endpoints = [] } = useComponentEndpoints(component?.id ?? '', selectedTrackId);
  const apimEndpoints = useMemo(() => Array.from(new Map(endpoints.filter((e) => e.apimId).map((e) => [e.apimId, e])).values()), [endpoints]);

  const [selectedApimIdState, setSelectedApimId] = useState<string | null>(null);
  const selectedApimId = apimEndpoints.some((e) => e.apimId === selectedApimIdState) ? selectedApimIdState : (apimEndpoints[0]?.apimId ?? null);

  const { data: policies = [], isLoading: loadingPolicies } = useThrottlingPolicies();
  const { data: apimInfo, isLoading: loadingApim } = useApimApi(selectedApimId);
  const { mutateAsync: updateApim, isPending: saving } = useUpdateApimApi();

  const [activePolicies, setActivePolicies] = useState<Record<string, boolean>>({});
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!policies.length) return;
    const active = apimInfo?.policies ?? [];
    const init: Record<string, boolean> = {};
    policies.forEach((p) => {
      init[p.name] = active.includes(p.name);
    });
    setActivePolicies(init);
  }, [apimInfo, policies]);

  const isDirty = useMemo(() => policies.some((p) => !!activePolicies[p.name] !== !!(apimInfo?.policies ?? []).includes(p.name)), [activePolicies, apimInfo, policies]);

  const handleToggle = (name: string) => {
    setActivePolicies((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSave = async () => {
    if (!selectedApimId || !apimInfo) return;
    const selected = Object.entries(activePolicies)
      .filter(([, on]) => on)
      .map(([name]) => name);
    try {
      await updateApim({ apimId: selectedApimId, body: { ...apimInfo, policies: selected } });
      setAlert({ type: 'success', message: 'Subscription plans updated successfully.' });
    } catch {
      setAlert({ type: 'error', message: 'Failed to update subscription plans. Please try again.' });
    }
  };

  const handleCancel = () => {
    if (!policies.length) return;
    const active = apimInfo?.policies ?? [];
    const init: Record<string, boolean> = {};
    policies.forEach((p) => {
      init[p.name] = active.includes(p.name);
    });
    setActivePolicies(init);
    setAlert(null);
  };

  const endpointPicker =
    apimEndpoints.length > 0 ? (
      <Select size="small" value={selectedApimId ?? ''} onChange={(e) => setSelectedApimId(e.target.value as string)} disabled={apimEndpoints.length === 1} inputProps={{ 'aria-label': 'Endpoint' }} sx={{ ...PILL_SELECT_SX, minWidth: 160 }}>
        {apimEndpoints.map((ep) => (
          <MenuItem key={ep.apimId} value={ep.apimId!}>
            {ep.displayName}
          </MenuItem>
        ))}
      </Select>
    ) : null;

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (!component) {
    return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {aggregatedTracks.length > 0 && (
        <DeploymentTrackBar tracks={aggregatedTracks} selectedId={selectedTrackId} onChange={setSelectedTrackId} orgHandler={scope.org} projectHandler={project?.handler ?? ''} componentHandler={component.handler} versionView extra={endpointPicker} />
      )}
      <PageContent>
        <Typography variant="h1" sx={{ mb: 3 }}>
          Plans
        </Typography>

        {alert && (
          <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 3 }}>
            {alert.message}
          </Alert>
        )}

        {!selectedApimId ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              No published endpoint found for this deployment track. Deploy your component first to configure subscription plans.
            </Typography>
          </Box>
        ) : loadingApim || loadingPolicies ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress color="primary" />
          </Box>
        ) : (
          <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <ListingTable size="small">
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Name</ListingTable.Cell>
                  <ListingTable.Cell>Display Name</ListingTable.Cell>
                  <ListingTable.Cell>Description</ListingTable.Cell>
                  <ListingTable.Cell>Quota</ListingTable.Cell>
                  <ListingTable.Cell>Burst Control</ListingTable.Cell>
                  <ListingTable.Cell>Stop on Quota Reach</ListingTable.Cell>
                  <ListingTable.Cell>Subscription Plan Status</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {policies.length === 0 ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No subscription plans available.
                      </Typography>
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : (
                  policies.map((policy) => (
                    <ListingTable.Row key={policy.name} hover>
                      <ListingTable.Cell>
                        <Typography variant="body2">{policy.name}</Typography>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Typography variant="body2">{policy.displayName}</Typography>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Typography variant="body2">{policy.description}</Typography>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Typography variant="body2">{formatQuota(policy)}</Typography>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <StatusBadge enabled={(policy.burstControl?.requestCount ?? 0) > 0} />
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <StatusBadge enabled={policy.stopOnQuotaReach ?? false} />
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Switch checked={!!activePolicies[policy.name]} onChange={() => handleToggle(policy.name)} size="small" color="primary" inputProps={{ 'aria-label': `${policy.name} subscription plan status` }} />
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  ))
                )}
              </ListingTable.Body>
            </ListingTable>
          </ListingTable.Container>
        )}

        {selectedApimId && !loadingApim && !loadingPolicies && policies.length > 0 && isDirty && !Object.values(activePolicies).some(Boolean) && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Please select at least one business plan
          </Alert>
        )}

        {selectedApimId && !loadingApim && !loadingPolicies && (
          <Box sx={{ display: 'flex', gap: 1, mt: 3 }}>
            <Button variant="outlined" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleSave} disabled={!isDirty || saving || !Object.values(activePolicies).some(Boolean)} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Box>
        )}
      </PageContent>
    </Box>
  );
}
