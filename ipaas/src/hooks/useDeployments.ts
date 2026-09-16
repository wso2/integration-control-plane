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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import { fetchApimSwagger } from '#api/apim';
import { fetchComponentByHandler } from '#api/components';
import { identifyIntegration } from '../utils/identifyIntegration';
import { trackEvent } from '../utils/tracking';
import { TYPE_TO_KIND } from '../constants/insights';
import {
  fetchComponentDeployment,
  fetchEnvEndpoints,
  fetchDeploymentStatus,
  fetchReleaseMgtDeployments,
  fetchDeploymentTrackImages,
  fetchByoiImageHistory,
  deployDeploymentTrack,
  triggerBuild,
  promote,
  stopDeployment,
  redeployDeployment,
  deployPrebuiltImage,
} from '#api/deployments';
import type { ComponentDeployment, BuildRun, DeployDeploymentTrackInput, PromoteInput, StopDeploymentInput, DeployPrebuiltImageInput, RecentDeployment } from '../types/deployment';
import type { DeployComponentInput } from '../types/build';
import type { ComponentDetail } from '../types/component';
import type { IntegrationKind } from '../types/insights';

const TERMINAL_CONCLUSIONS = new Set(['success', 'failure', 'cancelled', 'timed_out', 'neutral', 'skipped']);

export function useComponentDeployment(orgHandler: string, orgUuid: string, componentId: string, versionId: string, environmentId: string, options?: { refetchInterval?: number | false | ((query: Query<ComponentDeployment | null>) => number | false) }) {
  return useQuery<ComponentDeployment | null, Error, ComponentDeployment | null>({
    queryKey: ['componentDeployment', orgHandler, orgUuid, componentId, versionId, environmentId],
    queryFn: () => fetchComponentDeployment(orgHandler, orgUuid, componentId, versionId, environmentId),
    enabled: !!orgHandler && !!orgUuid && !!componentId && !!versionId && !!environmentId,
    retry: false,
    refetchInterval: options?.refetchInterval,
  });
}

export function useEnvEndpoints(componentId: string, versionId: string, releaseId: string) {
  return useQuery({
    queryKey: ['envEndpoints', componentId, versionId, releaseId],
    queryFn: () => fetchEnvEndpoints(componentId, versionId, releaseId),
    enabled: !!componentId && !!versionId && !!releaseId,
    staleTime: 30_000,
    retry: false,
  });
}

export function useApiDefinition(apimRevisionId: string | null | undefined) {
  return useQuery({
    queryKey: ['apiDefinition', apimRevisionId],
    queryFn: () => fetchApimSwagger(apimRevisionId!),
    enabled: !!apimRevisionId,
    staleTime: 60_000,
    retry: false,
  });
}

export function useDeploymentStatus(componentId: string, versionId: string) {
  return useQuery({
    queryKey: ['deploymentStatus', componentId, versionId],
    queryFn: () => fetchDeploymentStatus(componentId, versionId),
    enabled: !!componentId && !!versionId,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as BuildRun[] | undefined;
      if (!data || data.length === 0) return 15000;
      const allTerminal = data.every((d) => d.status === 'completed' || TERMINAL_CONCLUSIONS.has((d.conclusionV2 ?? d.conclusion ?? '').toLowerCase()));
      if (allTerminal) return false;
      // A running build drives the BuildCard stepper, so poll it tightly —
      // otherwise the card lags a quarter-minute behind each stage change.
      return data.some((d) => d.status === 'in_progress' || d.status === 'queued') ? 5000 : 15000;
    },
  });
}

export function useReleaseMgtDeployments(orgUuid: string, projectId: string, componentId: string, versionId: string, environmentId: string) {
  return useQuery({
    queryKey: ['releaseMgtDeployments', orgUuid, projectId, componentId, versionId, environmentId],
    queryFn: () => fetchReleaseMgtDeployments(orgUuid, projectId, componentId, versionId, environmentId),
    enabled: !!orgUuid && !!projectId && !!componentId && !!versionId && !!environmentId,
    retry: false,
    staleTime: 30_000,
  });
}

export function useDeploymentTrackImages(componentId: string, versionId: string, refetchInterval?: number) {
  return useQuery({
    queryKey: ['deploymentTrackImages', componentId, versionId],
    queryFn: async () => {
      const images = await fetchDeploymentTrackImages(componentId, versionId);
      return [...images].sort((a, b) => new Date(b.builtAt).getTime() - new Date(a.builtAt).getTime());
    },
    enabled: !!componentId && !!versionId,
    retry: false,
    staleTime: 30_000,
    refetchInterval,
  });
}

/** BYOI image history for the Deploy-page Set Up card (image-based components). */
export function useByoiImageHistory(orgUuid: string, projectId: string, componentId: string, versionId: string, enabled = true) {
  return useQuery({
    queryKey: ['byoiImageHistory', orgUuid, projectId, componentId, versionId],
    queryFn: () => fetchByoiImageHistory(orgUuid, projectId, componentId, versionId),
    enabled: enabled && !!orgUuid && !!projectId && !!componentId && !!versionId,
    retry: false,
    staleTime: 30_000,
  });
}

export function useRefreshEnvironmentArtifacts() {
  const qc = useQueryClient();

  return (envId: string, componentId: string) => {
    return Promise.all([
      qc.invalidateQueries({
        queryKey: ['artifacts'],
        predicate: (query) => {
          const [, , envIdKey, compIdKey] = query.queryKey;
          return envIdKey === envId && compIdKey === componentId;
        },
      }),
      qc.invalidateQueries({
        queryKey: ['artifactTypes', componentId, envId],
      }),
    ]);
  };
}

export function useDeployDeploymentTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeployDeploymentTrackInput) => deployDeploymentTrack(input),
    onSuccess: (_data, input) => {
      trackEvent('component-deploy');
      qc.invalidateQueries({ queryKey: ['deploymentStatus', input.componentId, input.id] });
      qc.invalidateQueries({ queryKey: ['executionConfigs', input.componentId] });
      qc.invalidateQueries({ queryKey: ['componentDeployment'] });
    },
  });
}

export function useTriggerBuild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeployComponentInput) => triggerBuild(input),
    onSuccess: (_data, input) => {
      trackEvent('component-build');
      qc.invalidateQueries({ queryKey: ['deploymentStatus', input.componentId, input.versionId] });
    },
  });
}

export function usePromote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PromoteInput) => promote(input),
    onSuccess: (_data, input) => {
      trackEvent('component-promote');
      qc.invalidateQueries({ queryKey: ['componentDeployment'] });
      qc.invalidateQueries({ queryKey: ['deploymentStatus', input.componentId] });
    },
  });
}

export function useStopDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StopDeploymentInput) => stopDeployment(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['executionConfigs', input.componentId] });
      qc.invalidateQueries({ queryKey: ['componentDeployment'] });
    },
  });
}

export function useRedeployDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orgHandler: string; componentId: string; releaseId: string; type: string; releaseMgtReleaseId?: string; releaseMgtDeploymentId?: string }) => redeployDeployment(input),
    onSuccess: () => {
      trackEvent('component-deploy');
      qc.invalidateQueries({ queryKey: ['componentDeployment'] });
    },
  });
}

export function useDeployPrebuiltImage() {
  return useMutation({
    mutationFn: (input: DeployPrebuiltImageInput) => deployPrebuiltImage(input),
    // This resolver occasionally times out upstream (504) under load. A couple of
    // quick retries clear most of these without forcing the user to redo the whole
    // prebuilt-integration flow (name check, component creation, config) — the caller's
    // catch-and-rollback only kicks in once retries are exhausted.
    retry: (failureCount, error) => failureCount < 2 && /HTTP 5\d\d/.test(error instanceof Error ? error.message : ''),
    retryDelay: 1500,
  });
}

// Deployment status per integration for one environment — drives the Status
// column on the project Insights table. Track resolution mirrors the overview
// pages: the `latest` deployment track (or the first) is the deployed version.
// Resolve a component's latest deployment track, then that track's deployment in
// the given environment. Shared by the project-scoped status and recent-deployment
// feeds, which both fan this out over every component.
async function resolveLatestDeployment(orgHandler: string, orgUuid: string, projectId: string, componentId: string, handler: string, environmentId: string): Promise<{ detail: ComponentDetail; deployment: ComponentDeployment | null }> {
  const detail = await fetchComponentByHandler(projectId, handler);
  const track = detail.deploymentTracks?.find((t) => t.latest) ?? detail.deploymentTracks?.[0];
  const deployment = track ? await fetchComponentDeployment(orgHandler, orgUuid, componentId, track.id, environmentId) : null;
  return { detail, deployment };
}

function kindFromDetail(detail: ComponentDetail): IntegrationKind {
  const t = identifyIntegration(detail.displayType, detail.componentSubType ?? null).type;
  return t === 'automation' ? 'auto' : t === 'rag-ingestion' ? 'rag' : (TYPE_TO_KIND[t] ?? 'api');
}

export function useIntegrationDeploymentStatuses(orgHandler: string, orgUuid: string, projectId: string, components: { id: string; handler: string }[], environmentId: string) {
  const key = components.map((c) => c.id).join(',');
  return useQuery({
    queryKey: ['integration-deployment-statuses', orgUuid, projectId, environmentId, key],
    queryFn: async () => {
      const entries = await Promise.all(
        components.map(async (c): Promise<[string, string]> => {
          try {
            const { deployment } = await resolveLatestDeployment(orgHandler, orgUuid, projectId, c.id, c.handler, environmentId);
            return [c.id, deployment?.deploymentStatusV2 ?? 'NOT_DEPLOYED'];
          } catch {
            // A failed status fetch is not evidence the integration is undeployed.
            return [c.id, 'UNKNOWN'];
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, string>;
    },
    enabled: !!orgHandler && !!orgUuid && !!projectId && !!environmentId && components.length > 0,
    staleTime: 60_000,
  });
}

/** Project-wide recent-deployments feed: fans out over every component, reads its
 * latest deployment in the given environment, and returns the newest first. */
export function useProjectRecentDeployments(orgHandler: string, orgUuid: string, projectId: string, components: { id: string; handler: string; name?: string }[], environmentId: string) {
  const key = components.map((c) => c.id).join(',');
  return useQuery({
    queryKey: ['project-recent-deployments', orgUuid, projectId, environmentId, key],
    queryFn: async (): Promise<RecentDeployment[]> => {
      const entries = await Promise.all(
        components.map(async (c): Promise<RecentDeployment | null> => {
          try {
            const { detail, deployment } = await resolveLatestDeployment(orgHandler, orgUuid, projectId, c.id, c.handler, environmentId);
            if (!deployment?.build?.deployedAt) return null;
            return {
              id: c.id,
              handler: c.handler,
              name: detail.displayName || c.handler,
              version: deployment.releaseMgtDeployment?.releaseMgtReleaseName ?? '',
              deployedAt: deployment.build.deployedAt,
              by: deployment.build.commit?.author?.name ?? '',
              status: deployment.deploymentStatusV2 ?? '',
              kind: kindFromDetail(detail),
            };
          } catch {
            return null;
          }
        }),
      );
      return entries
        .filter((e): e is RecentDeployment => e != null)
        .sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime())
        .slice(0, 3);
    },
    enabled: !!orgHandler && !!orgUuid && !!projectId && !!environmentId && components.length > 0,
    staleTime: 60_000,
  });
}
