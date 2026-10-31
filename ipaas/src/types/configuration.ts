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
 * the config key prefix the integration's names follow, absent for a link made only on WSO2 Cloud. `namesFromWso2Cloud`
 * is set when WSO2 Cloud set names for the link, which take precedence; `sourceDefined` when the integration's Workload
 * comes from its workload.yaml, which takes precedence, so the link is recorded but not applied. `linked` is false for
 * a resource only an environment's release still delivers.
 */
export interface ResourceLink {
  resourceType: string;
  displayName?: string;
  /** The Ballerina package the resource's preset is for. */
  package?: string;
  connection?: string;
  namesFromWso2Cloud?: true;
  sourceDefined?: true;
  linked: boolean;
  environments: ResourceLinkEnvironment[];
}

/**
 * What a link delivers in one environment: `state` (`linked` once the environment's release carries what the Workload
 * does; `in_release` on a row that isn't linked), whether the release carries the link at all, the configurables of
 * that release's build it sets (config key → resource key), whether the resource has values there, and the connection
 * the release's names follow: not the link's while the environment runs a release from before a Change link.
 */
export interface ResourceLinkEnvironment {
  name: string;
  state: 'linked' | 'next_release' | 'not_deployed' | 'in_release';
  inRelease: boolean;
  configurables: Record<string, string>;
  hasValues: boolean;
  connection?: string;
}

/**
 * What linking, changing or unlinking did to the integration's Workload: `updated` (development gets it now),
 * `next_deploy`, `unchanged` or `no_workload` (the integration's first deploy applies it); and where the resource has no
 * values yet.
 */
export interface ResourceLinkWrite {
  resourceType: string;
  connection?: string;
  workload: 'updated' | 'next_deploy' | 'unchanged' | 'no_workload';
  environmentsWithoutValues: string[];
}

/**
 * A resource a build calls for: registered from the preset variant of a Ballerina package it imports (`package`),
 * with the build's connections (config key prefixes) named after its keys, best match first. `linked` is set when the
 * integration links it already, with names of its own (no `linkedConnection`) or through a connection the build
 * doesn't have: accepting changes that link.
 */
export interface ResourceLinkSuggestion {
  resourceType: string;
  displayName: string;
  package: string;
  connections: string[];
  linked: boolean;
  linkedConnection?: string;
}

export interface CreateResourceLinkInput {
  projectId: string;
  componentId: string;
  resourceType: string;
  connection: string;
  /** Set when the integration links the resource already: the write moves that link. */
  changed?: boolean;
}

export interface DeleteResourceLinkInput {
  projectId: string;
  componentId: string;
  resourceType: string;
}
