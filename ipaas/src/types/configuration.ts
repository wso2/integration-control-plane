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

/** A resource linked to an integration: `configurables` maps each config key it supplies to the resource key whose value it receives. */
export interface ResourceLink {
  resourceType: string;
  configurables: Record<string, string>;
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
