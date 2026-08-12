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

import type { Commit } from './repository';
import type { ComponentDeployment, DeploymentTrackImage, DeploymentStatus } from './deployment';
import type { Environment } from './environment';
import type { ComponentTypeFlags } from '../utils/componentType';

export interface BuildAreaProps {
  componentId: string;
  versionId: string;
  orgHandler: string;
  orgUuid: string;
  projectId: string;
  deploymentPipelineId: string;
  flags: ComponentTypeFlags;
  branch: string;
  commits: Commit[];
  firstEnvId: string;
  firstEnvTemplateId: string;
  autoDeployEnabled?: boolean;
  componentName: string;
  projectHandler: string;
  displayType?: string;
  /**
   * Hide endpoint configuration on the Set Up card. True for file-/event-/
   * AI-agent integrations: they share a service displayType but expose no
   * user-configurable endpoints (devant only shows endpoint config for generic
   * services / MCP). Resolved by `identifyIntegration` in Deploy.tsx.
   */
  hideEndpoints?: boolean;
}

export interface DeployEnvironmentCardProps {
  orgHandler: string;
  orgUuid: string;
  projectId: string;
  componentId: string;
  versionId: string;
  deploymentPipelineId: string;
  flags: ComponentTypeFlags;
  /**
   * Hide the endpoint UI on the deploy card. True for file- and event-integration
   * (resolved via `identifyIntegration` by `componentSubType`, not from
   * `getComponentTypeFlags`): they share a service `displayType` but expose no
   * endpoints — their per-env signal is the runtime log stream.
   */
  hideEndpoints?: boolean;
  env: Environment;
  branch: string;
  componentName: string;
  projectHandler: string;
  nextEnvId?: string;
  isPromotionTarget?: boolean;
  /** Receives the environment actually being promoted into — in cloud the pipeline
   *  target, which is not necessarily `nextEnvId` — so callers can highlight it. */
  onPromoteStarted?: (targetEnvId: string) => void;
  onPromoteSettled?: () => void;
}

export interface DeployEnvironmentCardHeaderProps {
  envName: string;
  envCritical: boolean;
  showStop: boolean;
  stopDisabled: boolean;
  isStopPending: boolean;
  onStop: () => void;
  showStart: boolean;
  isRedeployPending: boolean;
  onStart: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export interface DeployEnvironmentCardBodyProps {
  status: DeploymentStatus | undefined;
  flags: ComponentTypeFlags;
  deployment: ComponentDeployment | null;
  scheduleDescription: string | null;
  nextRunLabel: string | null;
  releaseId: string;
  releaseName: string;
  isLoading: boolean;
  isImageLoading?: boolean;
  deployedImage: DeploymentTrackImage | null;
  deployedAt: string | null;
  envCritical: boolean;
  endpointCount?: number;
  configurablesCount?: number;
  scaleToZeroEnabled?: boolean;
  onConfigClick: () => void;
  onJobConfigClick?: () => void;
  onHistoryClick?: () => void;
  onEndpointsClick?: () => void;
}

export interface EndpointSecurityState {
  securityScheme: string[];
  apiKeyHeader: string;
  authorizationHeader: string;
  enableBackendJWT: boolean;
  backendJWTAudiences: string[];
  operationScopes: Record<string, string[]>;
  opSearch: string;
  opPage: number;
}
