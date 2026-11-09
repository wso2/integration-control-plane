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

import type { JSONSchema } from './schema';
import type { SchemaConfigItem } from './configuration';
import type { ComponentCreation } from './component';

export interface PrebuiltIntegration {
  displayName: string;
  description: string;
  applications: string[];
  bidirectional: boolean;
  componentType: string;
  buildPack: string;
  repositoryUrl: string;
  branch?: string;
  componentPath: string;
  tags: string[];
  imageUrl: string;
}

/** The fields needed to create a component from a prebuilt image; prebuilt integrations and image-backed samples both provide them. */
export type PrebuiltImageSource = Pick<PrebuiltIntegration, 'displayName' | 'description' | 'componentType' | 'buildPack' | 'repositoryUrl' | 'branch' | 'componentPath' | 'imageUrl'>;

export interface PrebuiltIntegrationsData {
  prebuiltIntegrations: PrebuiltIntegration[];
  applications: string[];
}

export interface PrebuiltInstructionsResult {
  instructions: string | undefined;
  isInstructionsLoading: boolean;
  isInstructionsError: boolean;
}

export interface PrebuiltConfigSchemaResult {
  configSchema: JSONSchema | undefined;
  isConfigSchemaLoading: boolean;
  isConfigSchemaError: boolean;
}

export interface PrebuiltDiagramResult {
  diagram: string | undefined;
  isDiagramLoading: boolean;
  isDiagramError: boolean;
}

export interface DeployPrebuiltIntegrationInput {
  integration: PrebuiltImageSource;
  orgHandler: string;
  projectId: string;
  configValues?: SchemaConfigItem[];
  /** How the integration was created, for usage analytics. Defaults to from-prebuilt with the integration's slug. */
  creation?: ComponentCreation;
}

export interface DeployPrebuiltIntegrationState {
  progress: number;
  stepLabel: string;
  error: string | null;
  /** A plan limit is a boundary rather than a malfunction, so quota surfaces as a warning. */
  errorSeverity: 'error' | 'warning';
  isDeploying: boolean;
  isSuccess: boolean;
  componentHandler: string | null;
  configSaveError: boolean;
}

/** A component version's release in a single environment. */
export interface AppEnvVersion {
  environmentId: string;
  releaseId: string;
}

/** One of a component's versions (deployment tracks), with its per-env releases. */
export interface ApiVersion {
  id: string;
  latest: boolean;
  appEnvVersions: AppEnvVersion[];
}

export interface PrebuiltComponentRef {
  id: string;
  handler: string;
  deploymentTracks: { id: string }[];
  /**
   * Per-version environment releases. A component's release (app-environment) is
   * provisioned at creation, so this carries the `releaseId` before any deploy —
   * unlike the `componentDeployment` query, which 404s until first deployment.
   */
  apiVersions?: ApiVersion[];
}

export interface PrebuiltEnvironmentRef {
  id: string;
  templateId?: string;
}
