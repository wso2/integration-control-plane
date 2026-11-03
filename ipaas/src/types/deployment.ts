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

import type { SchemaConfigItem } from './configuration';
import type { IntegrationKind } from './insights';

export const DeploymentStatus = {
  Active: 'Active',
  InProgress: 'InProgress',
  Error: 'Error',
  Suspended: 'Suspended',
  NotDeployed: 'NotDeployed',
} as const;

export type DeploymentStatus = (typeof DeploymentStatus)[keyof typeof DeploymentStatus];

export interface ReleaseMgtDeploymentRef {
  releaseMgtReleaseId: string;
  releaseMgtDeploymentId: string;
  releaseMgtReleaseName?: string;
}

export interface ComponentDeployment {
  releaseId: string;
  cron: string;
  cronTimezone: string;
  deploymentStatusV2?: string | null;
  invokeUrl?: string | null;
  imageUrl?: string | null;
  configCount?: number;
  releaseMgtDeployment?: ReleaseMgtDeploymentRef | null;
  build?: {
    buildId: string;
    deployedAt?: string;
    runId?: string;
    commit?: {
      sha: string;
      message: string;
      isLatest: boolean;
      author: { name: string; date: string; email: string; avatarUrl: string };
    };
  };
}

export interface BuildRun {
  id: number;
  sha: string;
  startedAt: string;
  completedAt: string;
  status: string;
  conclusion: string;
  conclusionV2: string;
  isAutoDeploy: boolean;
  isTriggeredAtCreation: boolean;
  name: string;
  failureReason: number;
  sourceCommitId: string;
  buildRef?: string;
}

export interface ReleaseMgtDeploymentComponentConfigs {
  configMappingRevision: number;
  schemaBasedConfigRevision: number;
  apiSettings: string;
}

export interface ReleaseMgtDeployment {
  id: string;
  releaseMgtId: string;
  environmentId: string;
  deploymentName: string;
  attempt: number;
  configRevision: number;
  status: string;
  comment: string;
  deployedAt: string;
  deployedBy: string;
  releaseName: string;
  commitHash: string;
  componentConfigs: ReleaseMgtDeploymentComponentConfigs;
  createdAt: string;
}

export interface DeploymentTrackImage {
  imageId: string;
  createdAt: string;
  updatedAt: string;
  commitHash: string;
  commitMessage: string;
  builtAt: string;
  runId: string;
  author: {
    name: string;
    email: string;
    date: string;
    avatarUrl: string;
  };
}

export interface DeployDeploymentTrackInput {
  componentId: string;
  id: string;
  imageId: string;
  environmentId: string;
  deploymentPipelineId?: string;
  cronTimezone?: string;
  cron?: string;
  jobTimeoutSeconds?: number;
  cronJobAllowConcurrency?: boolean;
}

export interface PromoteInput {
  componentId: string;
  apiVersionId: string;
  sourceReleaseId: string;
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
  deploymentPipelineId: string;
}

export interface StopDeploymentInput {
  orgHandler: string;
  componentId: string;
  releaseId: string;
  /** OpenChoreo's stop endpoint is per-environment. */
  environment: string;
  type?: string;
  clearCron?: boolean;
}

/**
 * A single image in a BYOI component's image history (devops REST API). Mirrors
 * Devant's `ImageInfo`; `imageUrl` is the fully-qualified `name:tag`.
 */
export interface ByoiImage {
  id: string;
  imageName: string;
  imageUrl: string;
  triggerSource: 'MANUAL' | 'EXTERNAL';
  updatedAt: string;
}

export interface DeployPrebuiltImageInput {
  componentId: string;
  imageUrl: string;
  appBranch: string;
  // Config values collected during setup. The cloud BFF bakes these onto the
  // Workload container at creation; devant ignores this field (it persists config
  // separately). Optional so existing callers are unaffected.
  configurations?: SchemaConfigItem[];
}

export interface RecentDeployment {
  id: string;
  handler: string;
  name: string;
  version: string;
  /** ISO-8601 deploy time */
  deployedAt: string;
  by: string;
  status: string;
  /** integration kind — the component maps it to a dot color */
  kind: IntegrationKind;
}
