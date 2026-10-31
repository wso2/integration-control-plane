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

import { useMemo } from 'react';
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
  fetchResourceLinks,
  fetchResourceLinkOptions,
  createResourceLink,
  deleteResourceLink,
} from '../api/configuration';
import type { CertMapping, SchemaConfigItem, SaveSchemaConfigInput, PostConfigMgtInput, CreateResourceLinkInput, DeleteResourceLinkInput, ResourceLink, ResourceLinkWrite } from '../types/configuration';
import { linkedConfigurables, rollingOut, type LinkRollouts } from '../utils/resourceLinks';

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

export function useResourceLinks(projectId: string, componentId: string, enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['resourceLinks', projectId, componentId],
    queryFn: () => fetchResourceLinks(projectId, componentId),
    enabled: enabled && !!projectId && !!componentId,
    retry: false,
    refetchInterval: (query) => (rollingOut(query.state.data, linkRollouts(qc, projectId, componentId)) ? ROLLOUT_POLL_MS : false),
  });
}

export function useResourceLinkOptions(projectId: string, componentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['resourceLinkOptions', projectId, componentId],
    queryFn: () => fetchResourceLinkOptions(projectId, componentId),
    enabled: enabled && !!projectId && !!componentId,
    retry: false,
  });
}

export function useCreateResourceLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['resourceLinkWrite', 'link'],
    mutationFn: (input: CreateResourceLinkInput) => createResourceLink(input),
    onSuccess: (_, vars) => invalidateLinks(qc, vars.projectId, vars.componentId),
  });
}

export function useDeleteResourceLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['resourceLinkWrite', 'unlink'],
    mutationFn: (input: DeleteResourceLinkInput) => deleteResourceLink(input),
    onSuccess: (_, vars) => invalidateLinks(qc, vars.projectId, vars.componentId),
  });
}

// A link change rolls the integration out in development.
const invalidateLinks = (qc: QueryClient, projectId: string, componentId: string) => {
  qc.invalidateQueries({ queryKey: ['resourceLinks', projectId, componentId] });
  qc.invalidateQueries({ queryKey: ['componentDeployment'] });
};

const ROLLOUT_POLL_MS = 3000;
const ROLLOUT_WINDOW_MS = 120_000;

// The links report what each release carries, and OpenChoreo changes development's release after a write that updates the Workload.
const linkRollouts = (qc: QueryClient, projectId: string, componentId: string): LinkRollouts =>
  Object.fromEntries(
    qc
      .getMutationCache()
      .findAll({ mutationKey: ['resourceLinkWrite'], status: 'success' })
      .flatMap((m) => {
        const vars = m.state.variables as DeleteResourceLinkInput;
        const w = m.state.data as ResourceLinkWrite;
        if (vars.projectId !== projectId || vars.componentId !== componentId) return [];
        return [[w.resourceType, { linked: m.options.mutationKey?.[1] === 'link', until: w.workload === 'updated' ? m.state.submittedAt + ROLLOUT_WINDOW_MS : 0 }]];
      }),
  );

const noLinks: ResourceLink[] = [];

/** The links of an open Configure form, and the configurables they supply in its environment. */
export function useFormLinks(projectId: string, componentId: string, env: string, open: boolean) {
  const { data: links = noLinks } = useResourceLinks(projectId, componentId, open);
  const linkedFrom = useMemo(() => linkedConfigurables(links, env), [links, env]);
  return { links, linkedFrom };
}
