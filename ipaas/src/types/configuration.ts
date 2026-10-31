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

export interface SchemaConfigValue {
  value: string;
  environmentUuid?: string;
}

export interface SchemaConfigItem {
  key: string;
  keyId?: string;
  values: SchemaConfigValue[];
  valueType?: string;
  isRequired?: boolean;
  isSensitive?: boolean;
  configGroupId?: string;
  configKeyId?: string;
  isDynamic?: boolean;
}

export interface SchemaConfigData {
  jsonSchema?: string;
  mappingId?: string;
  configurations: SchemaConfigItem[];
}

export interface CertGroupKey {
  keyUuid: string;
  key: string;
  isSensitive: boolean;
  isFile: boolean;
}

export interface CertGroup {
  groupUuid: string;
  groupName: string;
  groupDisplayName?: string;
  configurations: CertGroupKey[];
}

export interface CertMappingConfig {
  key: string;
  isDynamic: boolean;
  configGroupId?: string;
  configKeyId?: string;
  configGroupName?: string;
  configKeyName?: string;
  isFile?: boolean;
  isSensitive?: boolean;
  keyId?: string;
  values?: { value: string; environmentUuid: string }[];
}

export interface CertMapping {
  projectId: string;
  componentId: string;
  envTemplateId: string;
  deploymentTrackId: string;
  configurations: CertMappingConfig[];
  mappingId?: string;
}

export interface ConfigMgtValue {
  value?: string;
  valueRef?: string;
  isSensitive?: boolean;
}

export interface ConfigMgtItem {
  configKeyName: string;
  valueType: string;
  isSystem?: boolean;
  isRequired?: boolean;
  configurationValue?: ConfigMgtValue;
  metadata?: { isSecret?: boolean };
  configPackageName: string;
  configPackageOrganization: string;
}

export interface ConfigMgtData {
  jsonSchema?: string;
  configurationMount?: ConfigMgtItem[];
  defaultPackage?: string;
}

export interface SaveSchemaConfigInput {
  projectId: string;
  componentId: string;
  envId: string;
  deploymentTrackId: string;
  configurations: SchemaConfigItem[];
  mappingId?: string;
  commitHash?: string;
}

export interface ConfigMgtSaveItem {
  configKeyName: string;
  valueType: string;
  valueOrSource: string;
  valueReference?: string;
  isRequired: boolean;
  metadata?: { isSecret?: boolean };
  configPackageName?: string;
  configPackageOrganization?: string;
}

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

/**
 * A resource linked to an integration, with what it delivers in each environment, in pipeline order. `connection` is
 * the config key prefix its names follow, absent for a link made on WSO2 Cloud with names of its own. `linked` is
 * false for a resource the integration's workload.yaml declares (`declared`), or that only an environment's release
 * still delivers; there is nothing to unlink.
 */
export interface ResourceLink {
  resourceType: string;
  connection?: string;
  linked: boolean;
  declared?: boolean;
  environments: ResourceLinkEnvironment[];
}

/**
 * What a link delivers in one environment: whether that environment's release carries it, the configurables of
 * that release's build it sets (config key → resource key), whether the resource has values there, and, for a link
 * through a connection, whether the build has it and the connection the release's names follow: not the link's
 * while the environment runs a build from before a Change link, or an older build after a rollback.
 */
export interface ResourceLinkEnvironment {
  name: string;
  inRelease: boolean;
  configurables: Record<string, string>;
  hasValues: boolean;
  connectionInBuild: boolean;
  connection?: string;
  /** For a link without a connection: the release carries it under names or files other than the link's now. */
  earlierNames?: boolean;
}

/**
 * What linking, changing or unlinking did to the integration's current build: `updated` (development gets it now),
 * `next_deploy`, `unchanged` or `next_build` (the next build applies it); and where the resource has no values yet.
 */
export interface ResourceLinkWrite {
  resourceType: string;
  connection?: string;
  workload: 'updated' | 'next_deploy' | 'unchanged' | 'next_build';
  environmentsWithoutValues: string[];
}

/** A resource the integration could link, with the connections (config key prefixes) named after its keys, best match first. */
export interface ResourceLinkOption {
  resourceType: string;
  displayName: string;
  connections: string[];
}

export interface CreateResourceLinkInput {
  projectId: string;
  componentId: string;
  resourceType: string;
  connection: string;
}

export interface DeleteResourceLinkInput {
  projectId: string;
  componentId: string;
  resourceType: string;
}
