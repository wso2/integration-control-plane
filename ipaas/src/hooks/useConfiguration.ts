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

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  fetchCertificateGroups,
  fetchConfigGroups,
  fetchCertificateMappings,
  fetchSchemaConfig,
  fetchConfigMgt,
  saveSchemaConfig,
  postConfigMgt,
  postCertificateMappings,
  fetchIntegrationLinks,
  writeLink,
  fetchConnectableEndpoints,
} from '../api/configuration';
import type { CertMapping, SchemaConfigItem, SaveSchemaConfigInput, PostConfigMgtInput, IntegrationLinks, LinkWrite, LinkWriteInput } from '../types/configuration';
import type { PromoteInput } from '../types/deployment';
import { sameLinks } from '../utils/integrationLinks';

export function useCertificateGroups(projectId: string, componentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['certGroups', projectId, componentId],
    queryFn: () => fetchCertificateGroups(projectId, componentId),
    enabled: enabled && !!projectId && !!componentId,
    retry: false,
  });
}

export function useConfigGroups(projectId: string, componentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['configGroups', projectId, componentId],
    queryFn: () => fetchConfigGroups(projectId, componentId),
    enabled: enabled && !!projectId && !!componentId,
    retry: false,
  });
}

export function useCertificateMappings(projectId: string, componentId: string, envId: string, deploymentTrackId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['certMappings', projectId, componentId, envId, deploymentTrackId],
    queryFn: () => fetchCertificateMappings(projectId, componentId, envId, deploymentTrackId),
    enabled: enabled && !!projectId && !!componentId && !!envId && !!deploymentTrackId,
    retry: false,
  });
}

export function useSchemaConfig(projectId: string, componentId: string, envId: string, deploymentTrackId: string, commitHash?: string, enabled = true) {
  return useQuery({
    queryKey: ['schemaConfig', projectId, componentId, envId, deploymentTrackId, commitHash],
    queryFn: () => fetchSchemaConfig(projectId, componentId, envId, deploymentTrackId, commitHash),
    // Don't wait for commitHash: a deploy that fails before producing a commit still has a schema to show.
    enabled: enabled && !!projectId && !!componentId && !!envId && !!deploymentTrackId,
    retry: false,
  });
}

export function useGetConfigMgt(orgHandler: string, projectId: string, componentId: string, envId: string, versionId: string, componentName: string, commitHash?: string, drawerOpen = false) {
  return useQuery({
    queryKey: ['configMgt', orgHandler, projectId, componentId, envId, versionId, commitHash],
    queryFn: () => fetchConfigMgt(orgHandler, projectId, componentId, envId, versionId, componentName, commitHash),
    enabled: drawerOpen && !!orgHandler && !!projectId && !!componentId && !!envId && !!versionId && !!componentName,
    retry: false,
  });
}

export function useSaveSchemaConfig() {
  const qc = useQueryClient();
  return useMutation<{ configurations: SchemaConfigItem[] }, unknown, SaveSchemaConfigInput>({
    mutationFn: saveSchemaConfig,
    onSuccess: (data, vars) => {
      if (data && data.configurations) {
        qc.setQueryData(['schemaConfig', vars.projectId, vars.componentId, vars.envId, vars.deploymentTrackId, vars.commitHash], data);
      }
      qc.invalidateQueries({ queryKey: ['schemaConfig', vars.projectId, vars.componentId, vars.envId, vars.deploymentTrackId] });
      // Saving config redeploys the integration; the whole prefix goes since the key carries org and version.
      qc.invalidateQueries({ queryKey: ['componentDeployment'] });
    },
  });
}

export function usePostConfigMgt() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, PostConfigMgtInput>({
    mutationFn: postConfigMgt,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['configMgt', vars.orgHandler, vars.projectId, vars.componentId, vars.envId, vars.versionId] });
    },
  });
}

export function usePostCertificateMappings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CertMapping) => postCertificateMappings(data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['certMappings', vars.projectId, vars.componentId, vars.envTemplateId, vars.deploymentTrackId] });
    },
  });
}

export function useIntegrationLinks(projectId: string, componentId: string, enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['integrationLinks', projectId, componentId],
    queryFn: () => fetchIntegrationLinks(projectId, componentId),
    enabled: enabled && !!projectId && !!componentId,
    retry: false,
    refetchInterval: (query) => (query.state.data && rollingOut(qc, query.state.data, projectId, componentId) ? ROLLOUT_POLL_MS : false),
  });
}

/** The integrations this one may call. Read with the links, and only while the form is open. */
export function useConnectableEndpoints(projectId: string, componentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['connectableEndpoints', projectId, componentId],
    queryFn: () => fetchConnectableEndpoints(projectId, componentId),
    enabled: enabled && !!projectId && !!componentId,
    retry: false,
  });
}

export function useLinkWrite() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['linkWrite'],
    mutationFn: (input: LinkWriteInput) => writeLink(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['integrationLinks', vars.projectId, vars.componentId] });
      // A link to an endpoint makes the project's connection to it, which the listing then carries a ref for.
      qc.invalidateQueries({ queryKey: ['connectableEndpoints', vars.projectId, vars.componentId] });
      qc.invalidateQueries({ queryKey: ['componentDeployment'] });
    },
  });
}

const ROLLOUT_POLL_MS = 3000;
const ROLLOUT_WINDOW_MS = 120_000;

// OpenChoreo changes a release after the write: development's after a link write that updates the Workload, the
// target's after a promote. The links follow until the release has it.
const rollingOut = (qc: QueryClient, links: IntegrationLinks, projectId: string, componentId: string, now = Date.now()) =>
  qc
    .getMutationCache()
    .findAll({ status: 'success', predicate: (m) => ['linkWrite', 'promote'].includes(m.options.mutationKey?.[0] as string) })
    .some((m) => {
      if (now >= m.state.submittedAt + ROLLOUT_WINDOW_MS) return false;
      if (m.options.mutationKey?.[0] === 'promote') {
        const p = m.state.variables as PromoteInput;
        return p.componentId === componentId && !sameLinks(links, p.sourceEnvironmentId, p.targetEnvironmentId);
      }
      const vars = m.state.variables as LinkWriteInput;
      return vars.projectId === projectId && vars.componentId === componentId && (m.state.data as LinkWrite).workload === 'updated' && !!links.environments[0]?.linksNeedDeploy;
    });
