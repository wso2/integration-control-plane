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

/**
 * Cloud (OpenChoreo) configuration API. Calls the ipaas-service BFF.
 *
 * The config schema (component configurables) is wired to the BFF config-schema
 * route. Certificate/config-mgt groups & mappings are Choreo-v2 concepts absent
 * on the OpenChoreo stack, so they return safe defaults (matching the reference).
 */

import { bff, q, seg } from './_client';
import type {
  CertGroup,
  CertMapping,
  SchemaConfigData,
  ConfigMgtData,
  SchemaConfigItem,
  SaveSchemaConfigInput,
  ConfigMgtSaveItem,
  ResourceLink,
  ResourceLinkOption,
  ResourceLinkWrite,
  CreateResourceLinkInput,
  DeleteResourceLinkInput,
} from '../types/configuration';

export interface PostConfigMgtInput {
  orgHandler: string;
  projectId: string;
  componentId: string;
  envId: string;
  versionId: string;
  moduleName: string;
  commitHash: string;
  configs: ConfigMgtSaveItem[];
}

export const fetchSchemaConfig = (projectId: string, componentId: string, envId: string, _deploymentTrackId: string, _commitHash?: string): Promise<SchemaConfigData | null> =>
  bff.get<SchemaConfigData>(`/components/${seg(componentId)}/environments/${seg(envId)}/config-schema${q({ projectName: projectId })}`).catch(() => null);

export const saveSchemaConfig = (input: SaveSchemaConfigInput): Promise<{ configurations: SchemaConfigItem[] }> =>
  bff
    .post<{ configurations?: SchemaConfigItem[] }>(`/components/${seg(input.componentId)}/environments/${seg(input.envId)}/config-schema${q({ projectName: input.projectId })}`, {
      configurations: input.configurations,
      ...(input.commitHash ? { commitHash: input.commitHash } : {}),
    })
    .then((r) => ({ configurations: r?.configurations ?? input.configurations }));

export const fetchResourceLinks = (projectId: string, componentId: string): Promise<ResourceLink[]> => bff.get<ResourceLink[]>(`/components/${seg(componentId)}/links${q({ projectName: projectId })}`);

export const fetchResourceLinkOptions = (projectId: string, componentId: string): Promise<ResourceLinkOption[]> => bff.get<ResourceLinkOption[]>(`/components/${seg(componentId)}/link-options${q({ projectName: projectId })}`);

export const createResourceLink = ({ projectId, componentId, resourceType, connection }: CreateResourceLinkInput): Promise<ResourceLinkWrite> =>
  bff.post<ResourceLinkWrite>(`/components/${seg(componentId)}/links${q({ projectName: projectId })}`, { resourceType, connection });

export const deleteResourceLink = ({ projectId, componentId, resourceType }: DeleteResourceLinkInput): Promise<ResourceLinkWrite> => bff.delete<ResourceLinkWrite>(`/components/${seg(componentId)}/links/${seg(resourceType)}${q({ projectName: projectId })}`);

// --- Choreo-v2 concepts not present on the OpenChoreo stack: safe defaults. ---
export const fetchCertificateGroups = (_projectId: string, _componentId: string): Promise<CertGroup[]> => Promise.resolve([]);
export const fetchConfigGroups = (_projectId: string, _componentId: string): Promise<CertGroup[]> => Promise.resolve([]);
export const fetchCertificateMappings = (_projectId: string, _componentId: string, _envId: string, _deploymentTrackId: string): Promise<CertMapping | null> => Promise.resolve(null);
export const fetchConfigMgt = (_orgHandler: string, _projectId: string, _componentId: string, _envId: string, _versionId: string, _componentName: string, _commitHash?: string): Promise<ConfigMgtData> =>
  Promise.resolve({ configurations: [] } as unknown as ConfigMgtData);
export const postConfigMgt = (_input: PostConfigMgtInput): Promise<unknown> => Promise.resolve(null);
export const postCertificateMappings = (_data: CertMapping): Promise<unknown> => Promise.resolve(null);
