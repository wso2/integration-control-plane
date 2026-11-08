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
  /** Saved: a secret's value comes back empty, so this says it has one. */
  isSet?: boolean;
  configGroupId?: string;
  configKeyId?: string;
  isDynamic?: boolean;
  /** Set by the platform (a workflow integration's runtime connection); a save leaves it unchanged. */
  isManaged?: boolean;
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

/** A key of a resource, as the source of one target. */
export interface KeyRef {
  ref: string;
  key: string;
}

/** A resource the integration can link: its keys, and the environments where it has values. */
export interface LinkableResource {
  id: string;
  displayName: string;
  /** The Ballerina package its preset is for. */
  package?: string;
  keys: { name: string; secret: boolean }[];
  valuesIn: string[];
}

/** A connection in the Workload's build: its link, the resources that suit it, and the key the link gives each of its configurables. */
export interface LinkConnection {
  id: string;
  link?: string;
  suggestions: string[];
  fields: { configurable: string; key?: string }[];
}

/** A link whose target the Workload's build lacks. */
export interface OrphanedLink {
  target: string;
  kind: 'configurable' | 'connection' | 'endpoint';
  ref: string;
  key?: string;
}

/**
 * An integration of the organization this one may call, and the environments it may be called in.
 * `project` scope is an integration of this project, reached directly; `organization` scope is one of
 * another project, reached with an API key. `ref` is the connection standing for it already, absent
 * until the first link to it makes one.
 */
export interface ConnectableEndpoint {
  project: string;
  component: string;
  endpoint: string;
  displayName: string;
  scope: 'project' | 'organization';
  ref?: string;
  /**
   * What a link to it feeds the target, on an endpoint of another project. A link names one of them,
   * since nothing else says which of several values fills the target. An endpoint of this project
   * carries none: reached directly, it has only its address to give.
   */
  outputs?: ConnectableEndpointOutput[];
  environments: ConnectableEndpointEnvironment[];
}

/** One value a connection to the endpoint feeds, and whether it must be delivered as a secret. */
export interface ConnectableEndpointOutput {
  name: string;
  secret: boolean;
}

/** Whether an endpoint can be connected in one environment, and why not when it cannot. */
export interface ConnectableEndpointEnvironment {
  name: string;
  connectable: boolean;
  reason?: string;
  detail?: string;
}

/**
 * An endpoint as a link target: `<project>/<component>/<endpoint>`. The project is part of it because
 * the same field takes either kind — this project's endpoint fills a configurable directly, another
 * project's is reached as a connection — and the BFF tells them apart by the project.
 */
export const endpointId = (e: Pick<ConnectableEndpoint, 'project' | 'component' | 'endpoint'>): string => `${e.project}/${e.component}/${e.endpoint}`;

/** What one environment's release uses. */
export interface EnvironmentLinks {
  name: string;
  deployed: boolean;
  resources: { ref: string; state: 'in_use' | 'needs_restart' }[];
  valuesChanged: boolean;
  /** First environment only: the integration's links differ from its release's. */
  linksNeedDeploy: boolean;
  connections: Record<string, string>;
  /** Configurable id → the key it receives, by any source. */
  configurables: Record<string, KeyRef>;
  env: Record<string, KeyRef>;
}

/**
 * An integration's links. A configurable is `<org>/<module>:<name>`, a connection `<org>/<module>:<connection>`.
 * `used` is `<resource>|<KEY>` → the target it feeds; `usedByOrphaned` → the orphaned configurable link holding it,
 * which a write taking the key moves.
 */
export interface IntegrationLinks {
  kind: 'ballerina' | 'mi';
  resources: LinkableResource[];
  used: Record<string, string>;
  usedByOrphaned: Record<string, string>;
  connections: LinkConnection[];
  fieldLinks: Record<string, KeyRef>;
  /** Configurable id → the endpoint of this project filling it, `<project>/<component>/<endpoint>`. */
  endpointLinks: Record<string, string>;
  orphaned: OrphanedLink[];
  env: Record<string, KeyRef>;
  environments: EnvironmentLinks[];
  /** The repository's workload.yaml declares the integration's resources: links are ignored, and writes refused. */
  sourceDefined?: boolean;
  /** With sourceDefined: configurable id (or MI env var name) → the key workload.yaml gives it. */
  declared?: Record<string, KeyRef>;
}

/**
 * One link change: a target, and its source; without a source the target's own link goes.
 * A configurable takes one value, so `ref`/`key` and `endpoint` are alternatives.
 */
export type LinkTarget = { connection: string; ref?: string } | { configurable: string; ref?: string; key?: string; endpoint?: string } | { env: string; ref?: string; key?: string; endpoint?: string };

export interface LinkWriteInput {
  projectId: string;
  componentId: string;
  target: LinkTarget;
}

/** What a link change did to the Workload: `updated` (development gets it now), `next_deploy`, `unchanged` or `no_workload`. */
export interface LinkWrite {
  workload: 'updated' | 'next_deploy' | 'unchanged' | 'no_workload';
}
