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

import { Alert, Box, CircularProgress, Divider, MenuItem, PageContent, Select, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { useMemo, useState, type JSX } from 'react';
import NotFound from '../../components/NotFound';
import DeploymentTrackBar from '../../components/DeploymentTrackBar';
import MarketplaceTab from '../components/ApiInfo/MarketplaceTab';
import DeveloperPortalTab from '../components/ApiInfo/DeveloperPortalTab';
import GeneralTab from '../components/ApiInfo/GeneralTab';
import { useComponentByHandler, useComponentEndpoints } from '../../hooks/useComponents';
import { useProject, useProjectByHandler, useProjects } from '../../hooks/useProjects';
import { useApimApi, useUpdateApimApi } from '../../hooks/useApim';
import { broaden, resourceUrl, type ComponentScope } from '../../nav';
import { UUID_RE } from '../../utils/string';
import type { ApimApiInfo } from '../../types/apim';
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

export default function ComponentApiInfo(scope: ComponentScope): JSX.Element {
  const isUuid = UUID_RE.test(scope.project);
  const { data: projectByHandler, isLoading: loadingByHandler } = useProjectByHandler(!isUuid ? scope.project : '');
  const { data: projectById, isLoading: loadingById } = useProject(isUuid ? scope.project : '');
  const { data: allProjects = [], isLoading: loadingProjects } = useProjects();
  const projectFromList = !isUuid ? (allProjects.find((p) => p.handler === scope.project) ?? null) : null;
  const project = projectByHandler ?? projectById ?? projectFromList;
  const loadingProject = !project && (isUuid ? loadingById : loadingByHandler || loadingProjects);
  const projectId = project?.id ?? '';

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
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

  const selectedEndpoint = apimEndpoints.find((e) => e.apimId === selectedApimId) ?? null;
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? null;
  const selectedTrackVersion = selectedTrack?.apiVersion ?? '';

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

  const { data: apimInfo, isLoading: loadingApim } = useApimApi(selectedApimId);
  const { mutateAsync: updateApim, isPending: saving } = useUpdateApimApi();

  const [tab, setTab] = useState(0);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSave = async (patch: Partial<ApimApiInfo>) => {
    if (!selectedApimId || !apimInfo) return;
    try {
      await updateApim({ apimId: selectedApimId, body: { ...apimInfo, ...patch } });
      setAlert({ type: 'success', message: 'API information updated successfully.' });
    } catch {
      setAlert({ type: 'error', message: 'Failed to update API information. Please try again.' });
    }
  };

  const handleCancel = () => {
    setAlert(null);
  };

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
          API Info
        </Typography>
        {alert && (
          <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
            {alert.message}
          </Alert>
        )}

        {!selectedApimId ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              No published endpoint found for this deployment track. Deploy your component first to configure API information.
            </Typography>
          </Box>
        ) : loadingApim ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress color="primary" />
          </Box>
        ) : !apimInfo ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              Unable to load API information.
            </Typography>
          </Box>
        ) : (
          <>
            <Tabs value={tab} onChange={(_e, v) => setTab(v as number)} sx={{ mb: 0 }}>
              <Tab label="Marketplace" />
              <Tab label="Developer Portal" />
              <Tab label="General" />
            </Tabs>
            <Divider sx={{ mb: 3 }} />

            {tab === 0 && (
              <MarketplaceTab
                apimId={selectedApimId!}
                componentId={component.id}
                version={selectedTrackVersion}
                endpoint={selectedEndpoint}
                endpointName={selectedEndpoint?.displayName ?? apimInfo.displayName}
                projectName={project?.name}
                apimInfo={apimInfo}
                onSave={handleSave}
                onCancel={handleCancel}
                saving={saving}
              />
            )}
            {tab === 1 && <DeveloperPortalTab apimId={selectedApimId ?? ''} apimInfo={apimInfo} onSave={handleSave} onCancel={handleCancel} onError={(msg) => setAlert({ type: 'error', message: msg })} saving={saving} />}
            {tab === 2 && <GeneralTab apimInfo={apimInfo} />}
          </>
        )}
      </PageContent>
    </Box>
  );
}
