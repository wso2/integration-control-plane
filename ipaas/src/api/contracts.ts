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
 * API Contracts — the single source of truth that every product implementation
 * (`wip/`, `cloud/`, `icp/`) must satisfy.
 *
 * Each `<product>/_check.ts` performs a compile-time assertion that its module
 * exports conform to these interfaces, so any drift surfaces as a TypeScript
 * error during `tsc`/`vite build`.
 *
 * Rules:
 *  - Every interface member maps 1-to-1 to an exported function in the
 *    matching `src/api/<product>/<domain>.ts` file.
 *  - All return/parameter types come from `src/types/*` so the hooks and UI
 *    layers never depend on a product-specific type.
 *  - Pure synchronous utilities (e.g. data normalizers) belong in the product
 *    files but stay out of these contracts — only async/API surface is pinned.
 */

import type { AlertComponentType } from '../constants/alerts';
import type { AlertHistoryResponse, AlertRule, AlertRuleCountUsage } from '../types/alerts';
import type { ApimApiInfo, GeneratedTestKey, DeploySettingsV2Payload, LifecycleState, LifecycleHistory, MarketplaceService } from '../types/apim';
import type { ApiExposure, ApiKeyAuthOptions, ApiKeyResult, ApiKeySummary, Consumer, CreateApiKeyInput, CreateConsumerInput, EndpointPolicyConfig, EndpointRef, SecurityConfig, ConsumerCredential } from '../types/consumers';
import type { ArtifactType, Artifact, ArtifactParam, ArtifactStatusInput, ListenerStateInput, ArtifactToggleStatusInput, ArtifactToggleKind, TriggerTaskInput } from '../types/artifact';
import type {
  User,
  Role,
  RoleDetail,
  Group,
  GroupRoleMapping,
  GroupUser,
  PermissionsResponse,
  RoleGroupMapping,
  UserPermissionsResponse,
  ChangePasswordInput,
  ForceChangePasswordInput,
  CreateUserInput,
  UpdateUserInput,
  UpdateUserGroupsInput,
  CreateRoleInput,
  UpdateRoleInput,
  CreateGroupInput,
  UpdateGroupInput,
  AddRolesToGroupInput,
  RemoveRoleFromGroupInput,
  AddUsersToGroupInput,
  RemoveUserFromGroupInput,
  MessageResult,
  ResetPasswordResult,
  PendingInvitation,
  InviteUsersInput,
} from '../types/auth';
import type { BuildRunLogs, DeployComponentInput, UpdateBuildpackConfigsInput } from '../types/build';
import type { CodeServerInstance, ContainerRegistry } from '../types/cloudEditor';
import type {
  Component,
  ComponentDetail,
  EnvEndpoint,
  CreateComponentInput,
  UpdateComponentInput,
  UpdateAutoDeployInput,
  UpdateEndpointInput,
  GenerateComponentEndpointsInput,
  ComponentNameAvailability,
  DeleteComponentResult,
  DeploymentTrack,
  CreateDeploymentTrackInput,
  DeleteTrackResult,
  CheckDeletableResult,
} from '../types/component';
import type { CertGroup, CertMapping, SchemaConfigData, ConfigMgtData, SchemaConfigItem, SaveSchemaConfigInput, PostConfigMgtInput } from '../types/configuration';
import type { ComponentDeployment, BuildRun, ReleaseMgtDeployment, DeploymentTrackImage, DeployDeploymentTrackInput, PromoteInput, StopDeploymentInput, DeployPrebuiltImageInput, ByoiImage } from '../types/deployment';
import type { CreateDeploymentPipelineRequest, DeploymentPipeline, EnvTemplate, PipelineDeletionEligibility } from '../types/deploymentPipeline';
import type { OnPremKey, OnPremKeySubscription } from '../types/onPremKey';
import type { EgressPolicy, EgressPolicyRequest } from '../types/egressPolicy';
import type { AuthzRole, CreateAuthzRoleInput, UpdateAuthzRoleInput } from '../types/projectAuthz';
import type { ByoiEndpointFileContents, CreateByoiComponentInput, CreateByoiComponentResult, DevopsVolume, DevopsVolumeMount, VolumeMountWriteData, VolumeWriteData } from '../types/tailscale';
import type {
  ConfigMapWriteData,
  ConfigMountPath,
  ConfigMountWriteData,
  ContainerWriteData,
  DevopsConfigMap,
  DevopsConfigMapDetails,
  DevopsConfigMount,
  DevopsSecret,
  DevopsSecretDetails,
  ReleaseContainer,
  ReleaseDetails,
  SecretWriteData,
} from '../types/devopsConfigs';
import type { ExternalCiToken } from '../types/externalCi';
import type { StorageClass, Volume, VolumeCreateData, VolumeMount, VolumeMountCreateData, VolumeMountPath, VolumeMountUpdateData } from '../types/storage';
import type { Autoscaling, AutoscalingWriteData, ClusterPod, Hpa, HpaMetric, HpaWriteData, HttpScaler, HttpScalerWriteData, PodMetrics, ScalingMethodToggle, ScalingPath, ScalingState } from '../types/scaling';
import type { HealthCheck, HealthCheckWriteData } from '../types/healthChecks';
import type { CreateUrlMappingInput, CustomDomain, CustomDomainType, CustomUrlMapping } from '../types/customDomain';
import type { OrgWorkflowConfig, ReviewerDecisionRequest, WorkflowConfigRequest, WorkflowDefinition, WorkflowInstanceResponse, WorkflowReviewData } from '../types/workflow';
import type { Dataplane, IdentityProvider, IdentityProviderRequest, RoleGroupMappingResponse } from '../types/appSecurity';
import type { Cluster, PdpManagerPdp } from '../types/dataPlanes';
import type { ClusterPod as RuntimeClusterPod, PodEvent as RuntimePodEvent, PodLogOptions as RuntimePodLogOptions, RuntimeMetrics, RuntimeReleaseDetails } from '../types/runtime';
import type { CreateGitCredentialInput, CredentialDeleteEligibility, GitCredential } from '../types/credentials';
import type { Environment, CloudDataPlane, EnvironmentInput, EnvironmentTemplate, CreateEnvironmentData, EnvDeletionEligibility } from '../types/environment';
import type { StopScheduleInput, ExecutionConfigs, TaskExecution, ExecutionLogEntry, ExecutionLogWindow, ExecutionArgument, UpdateJobConfigsInput, TriggerComponentInput, TriggerRunResult, RuntimeArgument } from '../types/executions';
import type { SubscriptionList, ComponentLimits } from '../types/subscription';
import type { ConfigGroup, ConfigGroupNameAvailability, ConfigGroupUsage, CreateConfigGroupRequest, EditConfigGroupRequest } from '../types/configGroups';
import type { Certificate, CreateCertificateInput } from '../types/certificates';
import type {
  ChoreoConnectionRequest,
  Connection,
  ConnectionCatalogResponse,
  ConnectionListingRecord,
  ConnectionRequest,
  ConnectionServiceIdl,
  ConnectionUpdatePayload,
  DeleteConnectionParams,
  EnvKeyRotationParams,
  ListCatalogParams,
  ListConnectionsParams,
  ResourceConnectionRequest,
  RotateConnectionKeysByConnectionIdParams,
} from '../types/connections';
import type { AuditLogEntry, AuditLogsRequest } from '../types/auditLogs';
import type {
  Ruleset,
  RulesetList,
  DocumentInfo,
  DocumentList,
  GovernancePolicyInfo,
  GovernancePolicyList,
  ProjectComplianceResponse,
  PolicyAdherenceResponse,
  ProjectPolicyAdherenceResponse,
  ComponentComplianceResponse,
  EndpointPolicyAdherenceResponse,
  EndpointRulesetAdherenceResponse,
  RuleAdherenceResponse as GovernanceRuleAdherenceResponse,
} from '../types/governance';
import type {
  AdminUser,
  AllowedIpsPayload,
  BackupsResponse,
  CaCertificate,
  CredentialPayload,
  DatabaseInfo,
  DatabaseServer,
  DatabaseServerDetail,
  DbCredential,
  KafkaAcl,
  KafkaTopic,
  KafkaTopicCreatePayload,
  KafkaTopicUpdatePayload,
  KafkaUser,
  KafkaUserConfigs,
  LogsRequest as ServerLogsRequest,
  LogsResponse as ServerLogsResponse,
  MaintenanceWindow,
  MetricPeriod,
  OrgServiceAvailability,
  ServerMetricsResponse,
  ServerVariant,
  ServicePlan,
  ServiceType,
  CreateServerPayload,
} from '../types/platformServices';
import type {
  ConnectionConfigRequest,
  ConnectionConfigResponse,
  CreateServiceRequest,
  CreateServiceResponse,
  GenAiProviderTemplate,
  GenAiProviderTemplateDetail,
  GenAiService,
  GenAiServiceListResponse,
  GenAiServiceStatus,
  ServiceIdl,
  UpdateServiceRequest,
} from '../types/genaiServices';
import type { RetrieveRequestBody, RetrieveResponse } from '../types/ragIngestion';
import type { InsightsEnvironment, ComponentInsights } from '../types/insights';

// RAG backend — the Retrieval query endpoint. wip-only; cloud/icp stubs throw.
export interface RagBackendApi {
  retrieveChunks(body: RetrieveRequestBody): Promise<RetrieveResponse>;
}
import type { LogsRequest, ComponentLogsRequest, GatewayLogsPage, GatewayLogsRequest, LogRow } from '../types/logs';
import type { ApiDocument, RuleAdherenceResponse, ThrottlingPolicy } from '../types/marketplace';
import type { CreateMcpApiInput, CreatedMcpApi, McpFeatureOperation, McpProxyMetadata, CreateMcpProxyComponentInput } from '../types/mcpProxy';
import type { OrgEntry, OrgComponentLimits, OrgSubscription, RegisterUserResponse } from '../types/org';
import type { PrebuiltIntegrationsData, PrebuiltComponentRef, PrebuiltEnvironmentRef } from '../types/prebuilt';
import type { Project, ProjectContributor, ProjectHandlerAvailability, CreateProjectInput, CreateMonoRepoProjectInput, LinkProjectRepositoryInput, UpdateProjectInput } from '../types/project';
import type { Repository, Commit, UserRepo, RepoBranch, RepoMetadata, RepoTreeNode, ChoreoSampleImageEntry } from '../types/repository';
import type { Sample } from '../types/samples';

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface AlertsApi {
  getAlertRulesCount(baseUrl: string, componentId: string, environmentId: string, componentType: AlertComponentType): Promise<AlertRuleCountUsage>;
  getAlertRules(baseUrl: string, componentId: string, environmentId: string, componentType: AlertComponentType): Promise<AlertRule[]>;
  createAlertRule(baseUrl: string, alertRule: AlertRule): Promise<void>;
  updateAlertRule(baseUrl: string, alertRule: AlertRule): Promise<void>;
  deleteAlertRule(baseUrl: string, alertRule: AlertRule): Promise<void>;
  getAlertHistory(baseUrl: string, componentId: string, environmentId: string, startTime: string, endTime: string, limit?: number, versionIdList?: string[], alertTypes?: string[], searchPhrase?: string): Promise<AlertHistoryResponse>;
}

// ---------------------------------------------------------------------------
// APIM
// ---------------------------------------------------------------------------

export interface ApimApi {
  fetchApimApi(apimId: string): Promise<ApimApiInfo | null>;
  updateApimApi(apimId: string, body: ApimApiInfo): Promise<ApimApiInfo>;
  deleteApimApi(apimId: string): Promise<void>;
  generateTestKey(apimId: string, keyType: 'Development' | 'Production'): Promise<GeneratedTestKey | null>;
  deploySettingsV2(componentId: string, versionId: string, payload: DeploySettingsV2Payload): Promise<void>;
  fetchLifecycleState(apimId: string): Promise<LifecycleState | null>;
  fetchLifecycleHistory(apimId: string): Promise<LifecycleHistory | null>;
  changeLifecycleState(apimId: string, action: string): Promise<LifecycleState>;
  fetchApimSwagger(apimRevisionId: string): Promise<unknown>;
  fetchApimOverview(apimId: string): Promise<string>;
  saveApimOverview(apimId: string, content: string): Promise<void>;
  fetchApimThumbnail(apimId: string): Promise<string | null>;
  saveApimThumbnail(apimId: string, file: File): Promise<void>;
  fetchMarketplaceService(componentId: string, version: string, endpoint: EnvEndpoint): Promise<MarketplaceService | null>;
  saveMarketplaceService(serviceId: string, service: MarketplaceService): Promise<void>;
}

// ---------------------------------------------------------------------------
// API security & exposure (exposed API + policies + consumers) — cloud-only
// ---------------------------------------------------------------------------

export interface ConsumersApi {
  // Exposure
  exposeEndpoint(ref: EndpointRef): Promise<ApiExposure>;
  unexposeEndpoint(ref: EndpointRef): Promise<void>;

  // Endpoint security — API keys
  listEndpointApiKeys(ref: EndpointRef): Promise<ApiKeySummary[]>;
  createEndpointApiKey(ref: EndpointRef, input: CreateApiKeyInput): Promise<ApiKeyResult>;
  revokeEndpointApiKey(ref: EndpointRef, keyName: string): Promise<void>;
  createEndpointTestKey(ref: EndpointRef): Promise<ApiKeyResult>;

  // Endpoint security — enforcement policies
  setEndpointApiKeyAuth(ref: EndpointRef, enabled: boolean, options?: ApiKeyAuthOptions): Promise<boolean>;
  setEndpointJwtAuth(ref: EndpointRef, enabled: boolean): Promise<boolean>;
  /** Read the single active auth mode (+ options) of the exposed API. */
  getEndpointSecurity(ref: EndpointRef): Promise<SecurityConfig>;
  /** Set the single active auth mode (none/api-key/jwt); the BFF clears the other + redeploys. */
  setEndpointSecurity(ref: EndpointRef, cfg: SecurityConfig): Promise<SecurityConfig>;

  // Endpoint policies — CORS and rate limiting, written independently of the auth mode above.
  getEndpointPolicies(ref: EndpointRef): Promise<EndpointPolicyConfig>;
  setEndpointPolicies(ref: EndpointRef, cfg: EndpointPolicyConfig): Promise<EndpointPolicyConfig>;

  // Consumers — a consumer application holding an api-key on the exposed endpoint (no
  // subscription-token flow; the BFF implements /applications but no /subscriptions).
  /** One row per consumer application of the API exposed for `ref`, revoked ones included. */
  fetchConsumers(ref: EndpointRef, projectName?: string): Promise<Consumer[]>;
  /** Create a consumer application and mint its api-key. The plaintext key is returned once. */
  createConsumer(input: CreateConsumerInput): Promise<Consumer>;
  /** Re-issue a consumer's api-key (revoke + mint) in place. The new plaintext is returned once. */
  regenerateConsumerToken(ref: EndpointRef, consumer: Consumer): Promise<ConsumerCredential>;
  /** Revoke a consumer's api-key, keeping the consumer application so it can be regenerated. */
  revokeConsumer(ref: EndpointRef, consumer: Consumer): Promise<void>;
  /** Revoke the api-key *and* remove the consumer application. Not the same as revoking. */
  deleteConsumer(ref: EndpointRef, consumer: Consumer): Promise<void>;
}

// ---------------------------------------------------------------------------
// Artifact toggle mutations
// ---------------------------------------------------------------------------

export interface ArtifactToggleMutationsApi {
  updateArtifactToggleStatus(kind: ArtifactToggleKind, input: ArtifactToggleStatusInput): Promise<{ status: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export interface ArtifactsApi {
  fetchArtifactTypes(componentId: string, envId: string): Promise<ArtifactType[]>;
  fetchArtifacts(artifactType: string, envId: string, componentId: string): Promise<Artifact[]>;
  fetchArtifactSource(envId: string, componentId: string, artifactType: string, artifactName: string): Promise<string>;
  fetchLocalEntryValue(componentId: string, entryName: string, envId: string): Promise<string>;
  fetchArtifactParams(componentId: string, artifactType: string, artifactName: string, envId: string, runtimeId?: string): Promise<ArtifactParam[]>;
  fetchArtifactWsdl(componentId: string, artifactType: string, artifactName: string, envId: string, runtimeId?: string): Promise<string>;
  updateArtifactStatus(input: ArtifactStatusInput): Promise<{ status: string; message: string }>;
  updateListenerState(input: ListenerStateInput): Promise<{ success: boolean; message: string; commandIds: string[] }>;
}

// ---------------------------------------------------------------------------
// Auth — permissions, users, roles, groups
// ---------------------------------------------------------------------------

export interface AuthApi {
  fetchOrgPermissions(orgHandle: string, userId: string): Promise<UserPermissionsResponse>;
  fetchProjectPermissions(orgHandle: string, userId: string, projectId: string): Promise<UserPermissionsResponse>;
  fetchComponentPermissions(orgHandle: string, userId: string, projectId: string, componentId: string): Promise<UserPermissionsResponse>;
  fetchCurrentUser(orgHandler: string, userId: string): Promise<User>;
  fetchUsers(orgHandler: string): Promise<User[]>;
  changePassword(input: ChangePasswordInput): Promise<MessageResult>;
  forceChangePassword(input: ForceChangePasswordInput): Promise<MessageResult>;
  resetPassword(orgHandler: string, userId: string): Promise<ResetPasswordResult>;
  revokeUserTokens(orgHandler: string, userId: string): Promise<MessageResult>;
  unlockAccount(orgHandler: string, userId: string): Promise<MessageResult>;
  createUser(orgHandler: string, input: CreateUserInput): Promise<unknown>;
  updateUser(orgHandler: string, input: UpdateUserInput): Promise<unknown>;
  updateUserGroups(orgHandler: string, input: UpdateUserGroupsInput): Promise<unknown>;
  deleteUser(orgHandler: string, userId: string): Promise<unknown>;
  fetchPendingInvitations(orgHandler: string): Promise<PendingInvitation[]>;
  inviteUsers(orgHandler: string, input: InviteUsersInput): Promise<unknown>;
  deleteInvitation(orgHandler: string, invitationId: string): Promise<unknown>;
  fetchRoles(orgHandler: string, projectId?: string, integrationId?: string): Promise<Role[]>;
  fetchRoleDetail(orgHandler: string, roleId: string, projectId?: string, integrationId?: string): Promise<RoleDetail>;
  fetchAllPermissions(): Promise<PermissionsResponse>;
  createRole(orgHandler: string, input: CreateRoleInput): Promise<unknown>;
  updateRole(orgHandler: string, input: UpdateRoleInput): Promise<unknown>;
  deleteRole(orgHandler: string, roleId: string): Promise<unknown>;
  fetchRoleGroups(orgHandler: string, roleId: string, projectId?: string, integrationId?: string): Promise<RoleGroupMapping[]>;
  fetchGroups(orgHandler: string, projectId?: string, integrationId?: string): Promise<Group[]>;
  createGroup(orgHandler: string, input: CreateGroupInput): Promise<unknown>;
  updateGroup(orgHandler: string, input: UpdateGroupInput): Promise<unknown>;
  deleteGroup(orgHandler: string, groupId: string): Promise<unknown>;
  fetchGroupRoles(orgHandler: string, groupId: string, projectId?: string, integrationId?: string): Promise<GroupRoleMapping[]>;
  fetchGroupUsers(orgHandler: string, groupId: string): Promise<GroupUser[]>;
  addRolesToGroup(orgHandler: string, input: AddRolesToGroupInput, projectId?: string, componentId?: string): Promise<unknown>;
  removeRoleFromGroup(orgHandler: string, input: RemoveRoleFromGroupInput): Promise<unknown>;
  addUsersToGroup(orgHandler: string, input: AddUsersToGroupInput): Promise<unknown>;
  removeUserFromGroup(orgHandler: string, input: RemoveUserFromGroupInput): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Builds
// ---------------------------------------------------------------------------

export interface BuildsApi {
  fetchBuildRunLogs(orgHandler: string, projectId: string, componentId: string, runId: string): Promise<BuildRunLogs | null>;
  fetchBuildLogs(componentId: string, versionId: string, workflowName: string): Promise<BuildRunLogs | null>;
}

// ---------------------------------------------------------------------------
// Cloud Editor
// ---------------------------------------------------------------------------

export interface CloudEditorApi {
  getOrCreateSampleRegistry(orgUuid: string): Promise<ContainerRegistry>;
  callCreateCodeServer(params: { userId: string; organizationId: string; projectId: string; componentId: string; orgHandle: string; imageUrl: string; registryId: string; sourceCommitHash?: string }): Promise<CodeServerInstance>;
  /** One reading of an existing editor; null when none exists yet. Used to wait for readiness after the address is known. */
  getCodeServer(params: { userId: string; projectId: string; componentId: string }): Promise<CodeServerInstance | null>;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface ComponentsApi {
  fetchComponents(orgHandler: string, projectId: string): Promise<Component[]>;
  fetchComponentByHandler(projectId: string, componentHandler: string): Promise<ComponentDetail>;
  fetchComponentEndpoints(componentId: string, versionId: string): Promise<EnvEndpoint[]>;
  createComponent(input: CreateComponentInput): Promise<Component>;
  deleteComponent(input: { orgHandler: string; componentId: string; projectId: string }): Promise<DeleteComponentResult>;
  updateComponent(input: UpdateComponentInput): Promise<Component>;
  updateAutoDeployEnabled(input: UpdateAutoDeployInput): Promise<{ id: string; autoDeployEnabled: boolean }>;
  updateEndpoint(input: UpdateEndpointInput): Promise<object>;
  generateComponentEndpoints(input: GenerateComponentEndpointsInput): Promise<EnvEndpoint[]>;
  fetchComponentNameAvailability(projectId: string, componentNameCandidate: string): Promise<ComponentNameAvailability>;
  fetchComponentEndpointSpec(componentId: string, versionId: string, endpointId: string): Promise<string | null>;
  createMcpProxyComponent(input: CreateMcpProxyComponentInput): Promise<Component>;
  createDeploymentTrack(input: CreateDeploymentTrackInput): Promise<DeploymentTrack>;
  deleteDeploymentTrack(input: { orgHandler: string; componentId: string; projectId: string; deploymentTrackId: string }): Promise<DeleteTrackResult>;
  checkDeploymentTrackDeletable(input: { orgHandler: string; componentId: string; projectId: string; deploymentTrackId: string }): Promise<CheckDeletableResult>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ConfigurationApi {
  fetchCertificateGroups(projectId: string, componentId: string): Promise<CertGroup[]>;
  fetchConfigGroups(projectId: string, componentId: string): Promise<CertGroup[]>;
  fetchCertificateMappings(projectId: string, componentId: string, envId: string, deploymentTrackId: string): Promise<CertMapping | null>;
  fetchSchemaConfig(projectId: string, componentId: string, envId: string, deploymentTrackId: string, commitHash?: string): Promise<SchemaConfigData | null>;
  fetchConfigMgt(orgHandler: string, projectId: string, componentId: string, envId: string, versionId: string, componentName: string, commitHash?: string): Promise<ConfigMgtData>;
  saveSchemaConfig(input: SaveSchemaConfigInput): Promise<{ configurations: SchemaConfigItem[] }>;
  postConfigMgt(input: PostConfigMgtInput): Promise<unknown>;
  postCertificateMappings(data: CertMapping): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Copilot
// ---------------------------------------------------------------------------

export interface CopilotApi {
  getAiCopilotAnswer(copilotUrl: string, nlQuery: string, abortSignal: AbortSignal, correlationId: string, chatContext?: Record<string, unknown>): Promise<Response>;
  provideCopilotFeedback(orgId: string, feedback: boolean, correlationId: string): Promise<void>;
  getCopilotDataCollectionPermission(orgId: string): Promise<{ status: string }>;
  updateCopilotDataCollectionPermission(orgId: string, disabled: boolean): Promise<void>;
}

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------

export interface DeploymentsApi {
  fetchComponentDeployment(orgHandler: string, orgUuid: string, componentId: string, versionId: string, environmentId: string): Promise<ComponentDeployment | null>;
  fetchEnvEndpoints(componentId: string, versionId: string, releaseId: string): Promise<EnvEndpoint[]>;
  fetchDeploymentStatus(componentId: string, versionId: string): Promise<BuildRun[]>;
  fetchReleaseMgtDeployments(orgUuid: string, projectId: string, componentId: string, versionId: string, environmentId: string): Promise<ReleaseMgtDeployment[]>;
  fetchDeploymentTrackImages(componentId: string, versionId: string): Promise<DeploymentTrackImage[]>;
  fetchByoiImageHistory(orgUuid: string, projectId: string, componentId: string, versionId: string): Promise<ByoiImage[]>;
  deployDeploymentTrack(input: DeployDeploymentTrackInput): Promise<string>;
  triggerBuild(input: DeployComponentInput): Promise<{ message: string; success: boolean }>;
  promote(input: PromoteInput): Promise<string>;
  stopDeployment(input: StopDeploymentInput): Promise<string>;
  redeployDeployment(input: { orgHandler: string; componentId: string; releaseId: string; type: string; releaseMgtReleaseId?: string; releaseMgtDeploymentId?: string }): Promise<string>;
  deployPrebuiltImage(input: DeployPrebuiltImageInput): Promise<string>;
}

// ---------------------------------------------------------------------------
// Deployment (CD) pipelines
// ---------------------------------------------------------------------------

export interface DeploymentPipelinesApi {
  fetchEnvTemplates(orgNumericId: number): Promise<EnvTemplate[]>;
  fetchOrgDeploymentPipelines(orgUuid: string): Promise<DeploymentPipeline[]>;
  fetchProjectDeploymentPipelines(orgUuid: string, projectId: string): Promise<DeploymentPipeline[]>;
  createDeploymentPipeline(orgUuid: string, input: CreateDeploymentPipelineRequest): Promise<DeploymentPipeline>;
  updateDeploymentPipeline(orgUuid: string, pipelineId: string, input: CreateDeploymentPipelineRequest): Promise<DeploymentPipeline>;
  deleteDeploymentPipeline(orgUuid: string, pipelineId: string): Promise<void>;
  fetchPipelineDeletionEligibility(orgUuid: string, pipelineId: string): Promise<PipelineDeletionEligibility>;
  updateProjectDeploymentPipelines(orgUuid: string, projectId: string, deploymentPipelineIds: string[]): Promise<string[]>;
  setDefaultProjectDeploymentPipeline(orgUuid: string, projectId: string, defaultDeploymentPipelineId: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// On-prem keys
// ---------------------------------------------------------------------------

export interface OnPremKeysApi {
  fetchOnPremKeys(orgHandle: string): Promise<OnPremKey[]>;
  fetchOnPremKeySubscription(orgHandle: string): Promise<OnPremKeySubscription>;
  generateOnPremKey(orgHandle: string, displayName: string): Promise<OnPremKey>;
  regenerateOnPremKey(orgHandle: string, handle: string): Promise<OnPremKey>;
  renameOnPremKey(orgHandle: string, handle: string, displayName: string): Promise<OnPremKey>;
  revokeOnPremKey(orgHandle: string, handle: string): Promise<OnPremKey>;
}

// ---------------------------------------------------------------------------
// Application security (identity providers, role-group mappings, data planes)
// ---------------------------------------------------------------------------

export interface AppSecurityApi {
  fetchIdentityProviders(): Promise<IdentityProvider[]>;
  fetchIdentityProvider(id: string): Promise<IdentityProvider>;
  createIdentityProvider(input: IdentityProviderRequest): Promise<IdentityProvider>;
  updateIdentityProvider(id: string, input: IdentityProviderRequest): Promise<IdentityProvider>;
  deleteIdentityProvider(id: string): Promise<void>;
  fetchRoleGroupMappings(): Promise<RoleGroupMappingResponse>;
  updateRoleGroupMapping(roleId: string, groups: string[]): Promise<void>;
  fetchDataplanes(): Promise<Dataplane[]>;
}

// ---------------------------------------------------------------------------
// Credentials (git)
// ---------------------------------------------------------------------------

export interface CredentialsApi {
  fetchGitCredentials(): Promise<GitCredential[]>;
  createGitCredential(input: CreateGitCredentialInput): Promise<GitCredential>;
  checkGitCredentialDeletion(credentialId: string): Promise<CredentialDeleteEligibility>;
  deleteGitCredential(credentialId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Approval workflows
// ---------------------------------------------------------------------------

export interface WorkflowsApi {
  fetchWorkflowDefinitions(): Promise<WorkflowDefinition[]>;
  fetchWorkflowConfigs(): Promise<OrgWorkflowConfig[]>;
  createWorkflowConfig(input: WorkflowConfigRequest): Promise<OrgWorkflowConfig>;
  updateWorkflowConfig(configId: string, input: WorkflowConfigRequest): Promise<OrgWorkflowConfig>;
  fetchWorkflowInstances(): Promise<WorkflowInstanceResponse[]>;
  fetchPastWorkflowInstances(): Promise<WorkflowInstanceResponse[]>;
  fetchWorkflowReviewData(workflowId: string): Promise<WorkflowReviewData>;
  reviewWorkflowInstance(workflowId: string, input: ReviewerDecisionRequest): Promise<void>;
  cancelWorkflowInstance(workflowId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Egress control
// ---------------------------------------------------------------------------

export interface EgressControlApi {
  fetchEgressPolicy(orgUuid: string, projectId?: string): Promise<EgressPolicy | null>;
  createEgressPolicy(orgUuid: string, input: EgressPolicyRequest, projectId?: string): Promise<EgressPolicy>;
  updateEgressPolicy(orgUuid: string, policyId: string, input: EgressPolicyRequest, projectId?: string): Promise<EgressPolicy>;
  deleteEgressPolicy(orgUuid: string, policyId: string, projectId?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Project authorization (Application Security)
// ---------------------------------------------------------------------------

export interface ProjectAuthzApi {
  fetchAuthzRoles(projectId: string): Promise<AuthzRole[]>;
  createAuthzRole(projectId: string, input: CreateAuthzRoleInput): Promise<AuthzRole>;
  updateAuthzRole(projectId: string, input: UpdateAuthzRoleInput): Promise<AuthzRole>;
  deleteAuthzRole(roleId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Custom domains / URL mappings (URL Settings)
// ---------------------------------------------------------------------------

export interface CustomDomainsApi {
  fetchCustomDomains(type?: CustomDomainType): Promise<CustomDomain[]>;
  fetchComponentUrlMappings(componentId: string): Promise<CustomUrlMapping[]>;
  createUrlMapping(input: CreateUrlMappingInput): Promise<CustomUrlMapping>;
  updateUrlMapping(urlId: string, input: CreateUrlMappingInput): Promise<CustomUrlMapping>;
  deleteUrlMapping(urlId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Tailscale VPN (BYOI proxy create/config/deploy)
// ---------------------------------------------------------------------------

export interface TailscaleApi {
  getSampleRegistryId(orgUuid: string): Promise<string>;
  createByoiComponent(input: CreateByoiComponentInput): Promise<CreateByoiComponentResult>;
  deployByoiImage(componentId: string, releaseId: string, imageUrl: string): Promise<{ message: string; success: boolean }>;
  createVolume(orgUuid: string, projectId: string, data: VolumeWriteData): Promise<DevopsVolume>;
  mountVolume(orgUuid: string, projectId: string, path: { appId: string; appEnvId: string; containerId: string }, data: VolumeMountWriteData): Promise<DevopsVolumeMount>;
  getByoiEndpointsYaml(orgUuid: string, projectId: string, componentId: string, releaseId: string): Promise<ByoiEndpointFileContents>;
  updateByoiEndpointsYaml(orgUuid: string, projectId: string, componentId: string, releaseId: string, endpointsYaml: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Devops configs — ConfigMaps, Secrets, and container config-mounts
// ---------------------------------------------------------------------------

export interface DevopsConfigsApi {
  getReleaseById(orgUuid: string, projectId: string, componentId: string, releaseId: string): Promise<ReleaseDetails>;
  updateContainer(orgUuid: string, projectId: string, componentId: string, releaseId: string, containerId: string, data: ContainerWriteData): Promise<ReleaseContainer>;
  getSecrets(orgUuid: string, projectId: string, environmentId: string): Promise<DevopsSecret[]>;
  getSecretDetails(orgUuid: string, projectId: string, environmentId: string, secretId: string): Promise<DevopsSecretDetails>;
  createSecret(orgUuid: string, projectId: string, data: SecretWriteData): Promise<DevopsSecret>;
  updateSecret(orgUuid: string, projectId: string, secretId: string, data: SecretWriteData): Promise<DevopsSecret>;
  deleteSecret(orgUuid: string, projectId: string, environmentId: string, secretId: string): Promise<void>;
  getConfigMaps(orgUuid: string, projectId: string, environmentId: string): Promise<DevopsConfigMap[]>;
  getConfigMapDetails(orgUuid: string, projectId: string, environmentId: string, configMapId: string): Promise<DevopsConfigMapDetails>;
  createConfigMap(orgUuid: string, projectId: string, data: ConfigMapWriteData): Promise<DevopsConfigMap>;
  updateConfigMapData(orgUuid: string, projectId: string, configMapId: string, data: ConfigMapWriteData): Promise<DevopsConfigMapDetails>;
  deleteConfigMap(orgUuid: string, projectId: string, environmentId: string, configMapId: string): Promise<void>;
  getContainerConfigMounts(orgUuid: string, projectId: string, componentId: string, releaseId: string, containerId: string): Promise<DevopsConfigMount[]>;
  mountConfig(orgUuid: string, projectId: string, componentId: string, data: ConfigMountWriteData): Promise<DevopsConfigMount>;
  updateConfigMount(orgUuid: string, projectId: string, path: ConfigMountPath, data: ConfigMountWriteData): Promise<DevopsConfigMount>;
  removeConfigMount(orgUuid: string, projectId: string, path: ConfigMountPath): Promise<void>;
}

export interface HealthChecksApi {
  getHealthChecks(orgUuid: string, projectId: string, componentId: string, releaseId: string, environmentId: string): Promise<HealthCheck[]>;
  createHealthCheck(orgUuid: string, projectId: string, componentId: string, releaseId: string, environmentId: string, containerId: string, data: HealthCheckWriteData): Promise<HealthCheck>;
  updateHealthCheck(orgUuid: string, projectId: string, componentId: string, releaseId: string, environmentId: string, containerId: string, healthCheckId: string, data: HealthCheckWriteData): Promise<HealthCheck>;
  deleteHealthCheck(orgUuid: string, projectId: string, componentId: string, releaseId: string, environmentId: string, containerId: string, healthCheckId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// External CI
// ---------------------------------------------------------------------------

export interface ExternalCiApi {
  getExternalCiTokens(orgUuid: string, projectId: string, componentId: string): Promise<ExternalCiToken[]>;
  createExternalCiToken(orgUuid: string, projectId: string, componentId: string, tokenName: string): Promise<string>;
  revokeExternalCiToken(orgUuid: string, projectId: string, componentId: string, tokenId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

export interface EnvironmentsApi {
  fetchEnvironments(orgUuid: string, projectId: string): Promise<Environment[]>;
  fetchAllEnvironments(): Promise<Environment[]>;
  fetchCloudDataPlanes(orgUuid: string): Promise<CloudDataPlane[]>;
  createEnvironment(input: EnvironmentInput): Promise<Environment>;
  updateEnvironment(input: EnvironmentInput & { environmentId: string }): Promise<Environment>;
  deleteEnvironment(environmentId: string): Promise<string>;
  fetchEnvironmentTemplates(orgId: string): Promise<EnvironmentTemplate[]>;
  createOrgEnvironment(orgUuid: string, input: CreateEnvironmentData & { vhost: string }): Promise<void>;
  getEnvDeleteEligibility(orgUuid: string, templateId: string): Promise<EnvDeletionEligibility>;
  deleteEnvironmentTemplate(orgUuid: string, templateId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Executions
// ---------------------------------------------------------------------------

export interface ExecutionsApi {
  fetchExecutionConfigs(componentId: string, releaseId: string): Promise<ExecutionConfigs | null>;
  fetchTaskExecutions(releaseId: string): Promise<TaskExecution[]>;
  fetchRuntimeArguments(componentId: string, deploymentTrackId: string, commitHash: string): Promise<RuntimeArgument[]>;
  fetchExecutionArguments(runId: string, componentId: string, releaseId: string): Promise<ExecutionArgument[]>;
  /**
   * `run` carries the execution's bounds for backends that cannot filter logs
   * by run — cloud queries the observability proxy, whose log search scope
   * reaches only component + environment. Optional because backends addressing
   * a run directly have no use for it.
   */
  fetchExecutionLogs(componentId: string, deploymentTrackId: string, executionId: string, environmentId: string, run?: ExecutionLogWindow): Promise<ExecutionLogEntry[]>;
  fetchTaskExecutionCount(releaseId: string): Promise<number | null>;
  updateJobConfigs(input: UpdateJobConfigsInput): Promise<boolean>;
  /** Stops the CronJob's schedule. Cloud leaves the deployment untouched; wip clears the cron via its stop mutation. */
  stopSchedule(input: StopScheduleInput): Promise<void>;
  triggerTask(input: TriggerTaskInput): Promise<{ status: string; message: string; successCount: number; failedCount: number; details: string[] }>;
  triggerComponentRun(input: TriggerComponentInput): Promise<TriggerRunResult>;
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export interface InsightsApi {
  fetchInsightsEnvironments(orgUuid: string, projectId?: string): Promise<InsightsEnvironment[]>;
  fetchComponentInsights(orgUuid: string, insightsEnv: InsightsEnvironment, apiId: string, queryApiUrl: string, time?: { from: string; to: string }): Promise<ComponentInsights | null>;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export interface LogsApi {
  fetchLogs(req: LogsRequest, logsApiUrl: string): Promise<LogRow[]>;
  fetchComponentLogs(req: ComponentLogsRequest, logsApiUrl: string): Promise<LogRow[]>;
  fetchGatewayLogs(req: GatewayLogsRequest): Promise<GatewayLogsPage>;
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export interface MarketplaceApi {
  fetchThrottlingPolicies(): Promise<ThrottlingPolicy[]>;
  fetchApiDocuments(apimId: string): Promise<ApiDocument[]>;
  fetchRuleAdherence(projectId: string, componentId: string, apimId: string): Promise<RuleAdherenceResponse | null>;
}

// ---------------------------------------------------------------------------
// MCP proxy (convert an existing HTTP API to an MCP server)
// ---------------------------------------------------------------------------

export interface McpProxyApi {
  generateMcpFeatures(items: McpProxyMetadata[]): Promise<McpFeatureOperation[]>;
  createMcpApi(input: CreateMcpApiInput): Promise<CreatedMcpApi>;
}

// ---------------------------------------------------------------------------
// Org
// ---------------------------------------------------------------------------

export interface OrgApi {
  fetchOrgList(): Promise<OrgEntry[]>;
  fetchOrgs(): Promise<OrgEntry[]>;
  validateOrgName(orgName: string): Promise<boolean>;
  registerUser(orgName: string, termsAccepted: boolean, serviceName: string): Promise<RegisterUserResponse>;
  initOrg(orgUuid: string, region: string): Promise<void>;
  fetchProjectsByOrgId(orgNumericId: number): Promise<Project[]>;
  createDefaultProject(orgNumericId: number, orgHandler: string, projectHandler?: string): Promise<{ id: string; handler: string }>;
  fetchOrgComponentLimits(orgUuid: string): Promise<OrgComponentLimits>;
  fetchOrgSubscriptions(orgUuid: string): Promise<OrgSubscription[]>;
}

// ---------------------------------------------------------------------------
// Prebuilt integrations
// ---------------------------------------------------------------------------

export interface PrebuiltApi {
  fetchPrebuiltIntegrations(url: string, signal?: AbortSignal): Promise<PrebuiltIntegrationsData>;
  fetchPrebuiltAsset(baseUrl: string, filename: string, signal?: AbortSignal): Promise<Response>;
  checkNameAvailability(projectId: string, candidate: string): Promise<string>;
  fetchComponentDetail(projectId: string, handler: string): Promise<PrebuiltComponentRef>;
  fetchFirstEnvironment(orgUuid: string, projectId: string): Promise<PrebuiltEnvironmentRef>;
  fetchLatestCommitSha(componentId: string, branch: string): Promise<string>;
  savePrebuiltConfig(projectId: string, componentId: string, envId: string, deploymentTrackId: string, configurations: SchemaConfigItem[], commitHash: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectsApi {
  fetchProjects(orgId: number): Promise<Project[]>;
  fetchProject(orgId: number, projectId: string): Promise<Project>;
  fetchProjectByHandler(orgId: number, projectHandler: string): Promise<Project>;
  fetchProjectContributors(orgId: number, projectId: string): Promise<ProjectContributor[]>;
  fetchProjectComponentLabels(orgId: number, projectId: string): Promise<string[]>;
  fetchProjectHandlerAvailability(orgId: number, candidate: string): Promise<ProjectHandlerAvailability>;
  createProject(input: CreateProjectInput): Promise<Project>;
  createMonoRepoProject(input: CreateMonoRepoProjectInput): Promise<Project>;
  linkProjectRepository(input: LinkProjectRepositoryInput): Promise<Project>;
  updateProject(input: UpdateProjectInput): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface RepositoryApi {
  fetchComponentRepository(projectId: string, componentHandler: string): Promise<Repository | null>;
  fetchCommitHistory(componentId: string, branch: string): Promise<Commit[]>;
  fetchGitHubUserRepos(secretRef?: string): Promise<UserRepo[]>;
  fetchRepoBranches(repoOrg: string, repoName: string, isPublicRepo: boolean, secretRef?: string): Promise<RepoBranch[]>;
  fetchRepoMetadata(org: string, repo: string, branch: string, subPath: string, isPublicRepo?: boolean, secretRef?: string): Promise<RepoMetadata>;
  fetchChoreoSampleImages(orgUuid: string, projectId: string): Promise<ChoreoSampleImageEntry[]>;
  updateBuildpackConfigs(input: UpdateBuildpackConfigsInput): Promise<string>;
  /**
   * Exchange the GitHub OAuth code for repo access. `needsInstallation` (cloud
   * GitHub-App flow) signals "authorized but the App is not installed on any
   * account" — the UI should open the App installation page.
   */
  obtainGithubToken(authorizationCode: string): Promise<{ success: boolean; message: string; needsInstallation?: boolean }>;
  fetchRepoContents(org: string, repo: string, branch: string, isPublicRepo?: boolean, secretRef?: string): Promise<RepoTreeNode[]>;
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export interface SamplesApi {
  fetchSamples(url: string, signal?: AbortSignal): Promise<{ samples: Sample[] }>;
}

export interface SubscriptionsApi {
  getSubscriptions(orgUuid: string): Promise<SubscriptionList>;
  getComponentLimits(orgUuid: string): Promise<ComponentLimits>;
}

// Org admin Config Groups (config-svc). wip-only for now; cloud/icp stubs throw.
export interface ConfigGroupsApi {
  listConfigGroups(): Promise<ConfigGroup[]>;
  getConfigGroup(groupUuid: string): Promise<ConfigGroup>;
  checkConfigGroupName(candidateGroupName: string): Promise<ConfigGroupNameAvailability>;
  createConfigGroup(request: CreateConfigGroupRequest): Promise<ConfigGroup>;
  updateConfigGroup(request: EditConfigGroupRequest): Promise<ConfigGroup>;
  deleteConfigGroup(groupUuid: string): Promise<void>;
  getConfigGroupUsage(configGroupId: string): Promise<ConfigGroupUsage>;
}

// Connections (dependency-config service). wip-only for now; cloud/icp stubs throw.
export interface ConnectionsApi {
  listConnections(params: ListConnectionsParams): Promise<ConnectionListingRecord[]>;
  listConnectionCatalog(params: ListCatalogParams): Promise<ConnectionCatalogResponse>;
  getConnectionServiceIdl(serviceId: string): Promise<ConnectionServiceIdl>;
  getConnection(groupUuid: string): Promise<Connection>;
  createChoreoConnection(request: ChoreoConnectionRequest, generateCreds?: boolean): Promise<Connection>;
  createResourceConnection(request: ResourceConnectionRequest): Promise<Connection>;
  createThirdPartyConnection(request: ConnectionRequest): Promise<Connection>;
  createDatabaseConnection(request: ResourceConnectionRequest): Promise<Connection>;
  updateConnection(payload: ConnectionUpdatePayload): Promise<Connection>;
  deleteConnection(params: DeleteConnectionParams): Promise<void>;
  refreshConnection(connectionId: string): Promise<Connection>;
  rotateConnectionEnvKeys(params: EnvKeyRotationParams): Promise<void>;
  rotateConnectionKeysById(params: RotateConnectionKeysByConnectionIdParams): Promise<Connection>;
}

// Org audit logs (admin "Audit Logs"). wip-only for now; cloud/icp stubs throw.
export interface AuditLogsApi {
  fetchAuditLogs(orgUuid: string, request: AuditLogsRequest): Promise<AuditLogEntry[]>;
}

// Managed databases (admin "Databases"). wip-only; cloud/icp stubs throw. Grown per phase.
export interface PlatformServicesApi {
  getAvailability(orgUuid: string): Promise<OrgServiceAvailability>;
  listServers(orgUuid: string, variant?: ServerVariant): Promise<DatabaseServer[]>;
  getServer(serverId: string, variant?: ServerVariant): Promise<DatabaseServerDetail>;
  deleteServer(serverId: string, variant?: ServerVariant): Promise<void>;
  getServicePlans(type: ServiceType): Promise<ServicePlan[]>;
  createServer(payload: CreateServerPayload, variant?: ServerVariant): Promise<DatabaseServer>;
  setServerPoweredState(serverId: string, powered: boolean, variant?: ServerVariant): Promise<void>;
  getServerAdminUser(serverId: string): Promise<AdminUser>;
  getServerCaCertificate(serverId: string, variant?: ServerVariant): Promise<CaCertificate>;
  getServerMetrics(serverId: string, period: MetricPeriod, variant?: ServerVariant): Promise<ServerMetricsResponse>;
  listServerDatabases(serverId: string): Promise<DatabaseInfo[]>;
  getServerLogs(serverId: string, request: ServerLogsRequest, variant?: ServerVariant): Promise<ServerLogsResponse>;
  listServerBackups(serverId: string, variant?: ServerVariant): Promise<BackupsResponse>;
  createDatabase(serverId: string, name: string): Promise<DatabaseInfo>;
  setDatabaseMarketplace(serverId: string, name: string, displayOnMarketplace: boolean): Promise<void>;
  listDbCredentials(serverId: string, dbName?: string): Promise<DbCredential[]>;
  getDbCredential(serverId: string, credentialId: string): Promise<DbCredential>;
  createDbCredential(serverId: string, payload: CredentialPayload): Promise<DbCredential>;
  updateDbCredential(serverId: string, credentialId: string, payload: CredentialPayload): Promise<DbCredential>;
  deleteDbCredential(serverId: string, credentialId: string): Promise<void>;
  updateMaintenanceWindow(serverId: string, payload: MaintenanceWindow, variant?: ServerVariant): Promise<void>;
  updateAllowedIps(serverId: string, payload: AllowedIpsPayload, variant?: ServerVariant): Promise<void>;
  listKafkaTopics(brokerId: string): Promise<KafkaTopic[]>;
  createKafkaTopic(brokerId: string, payload: KafkaTopicCreatePayload): Promise<void>;
  getKafkaTopic(brokerId: string, topicName: string): Promise<KafkaTopic>;
  updateKafkaTopic(brokerId: string, topicName: string, payload: KafkaTopicUpdatePayload): Promise<void>;
  deleteKafkaTopic(brokerId: string, topicName: string): Promise<void>;
  getKafkaUserConfigs(): Promise<KafkaUserConfigs>;
  listKafkaUsers(brokerId: string): Promise<KafkaUser[]>;
  createKafkaUser(brokerId: string, username: string): Promise<void>;
  deleteKafkaUser(brokerId: string, username: string): Promise<void>;
  resetKafkaUserCredentials(brokerId: string, username: string): Promise<void>;
  listKafkaAcls(brokerId: string): Promise<{ acls: KafkaAcl[] }>;
  createKafkaAcl(brokerId: string, payload: Omit<KafkaAcl, 'id'>): Promise<void>;
  deleteKafkaAcl(brokerId: string, aclId: string): Promise<void>;
}

// Org admin GenAI Services (internal-marketplace). wip-only for now; cloud/icp stubs throw.
export interface GenaiServicesApi {
  listGenaiServices(params: { query?: string; offset: number; limit: number; projectId?: string }): Promise<GenAiServiceListResponse>;
  listThirdPartyServices(params: { query?: string; offset: number; limit: number; projectId?: string }): Promise<GenAiServiceListResponse>;
  listProviderTemplates(): Promise<GenAiProviderTemplate[]>;
  getProviderTemplate(templateId: string): Promise<GenAiProviderTemplateDetail>;
  createGenaiService(request: CreateServiceRequest): Promise<CreateServiceResponse>;
  getGenaiService(serviceId: string): Promise<GenAiService>;
  updateGenaiService(serviceId: string, request: UpdateServiceRequest): Promise<GenAiService>;
  getGenaiServiceIdl(serviceId: string): Promise<ServiceIdl>;
  updateGenaiServiceIdl(serviceId: string, content: string): Promise<void>;
  getConnectionConfig(serviceId: string, schemaId: string): Promise<ConnectionConfigResponse>;
  updateConnectionConfig(serviceId: string, schemaId: string, request: ConnectionConfigRequest): Promise<void>;
  addConnectionConfig(serviceId: string, schemaId: string, request: ConnectionConfigRequest): Promise<void>;
  setGenaiServiceStatus(serviceId: string, status: GenAiServiceStatus): Promise<void>;
  deleteGenaiService(serviceId: string): Promise<void>;
}

// Org admin Governance (rulesets, documents, policies). wip-only for now; cloud/icp stubs throw.
export interface GovernanceApi {
  listRulesets(): Promise<RulesetList>;
  getRuleset(rulesetId: string): Promise<Ruleset>;
  getRulesetContent(rulesetId: string): Promise<string>;
  createRuleset(ruleset: Ruleset): Promise<Ruleset>;
  updateRuleset(rulesetId: string, ruleset: Ruleset): Promise<Ruleset>;
  deleteRuleset(rulesetId: string): Promise<void>;

  listDocuments(): Promise<DocumentList>;
  getDocument(documentId: string): Promise<DocumentInfo>;
  createDocument(document: DocumentInfo): Promise<DocumentInfo>;
  updateDocument(documentId: string, document: DocumentInfo): Promise<DocumentInfo>;
  deleteDocument(documentId: string): Promise<void>;

  listPolicies(): Promise<GovernancePolicyList>;
  getPolicy(policyId: string): Promise<GovernancePolicyInfo>;
  createPolicy(policy: GovernancePolicyInfo): Promise<GovernancePolicyInfo>;
  updatePolicy(policyId: string, policy: GovernancePolicyInfo): Promise<GovernancePolicyInfo>;
  deletePolicy(policyId: string): Promise<void>;

  fetchProjectCompliance(): Promise<ProjectComplianceResponse>;
  fetchPolicyAdherence(): Promise<PolicyAdherenceResponse>;
  fetchProjectPolicyAdherence(projectId: string): Promise<ProjectPolicyAdherenceResponse>;
  fetchComponentCompliance(projectId: string): Promise<ComponentComplianceResponse>;
  fetchEndpointPolicyAdherence(projectId: string, componentId: string, apimId: string): Promise<EndpointPolicyAdherenceResponse>;
  fetchEndpointRulesetAdherence(projectId: string, componentId: string, apimId: string): Promise<EndpointRulesetAdherenceResponse>;
  fetchEndpointRuleAdherence(projectId: string, componentId: string, apimId: string): Promise<GovernanceRuleAdherenceResponse>;
}

// Org admin Certificates (TLS trust certificates stored as config groups). wip-only for now.
export interface CertificatesApi {
  listCertificateGroups(): Promise<ConfigGroup[]>;
  createCertificate(input: CreateCertificateInput): Promise<Certificate>;
  deleteCertificate(certificateId: string): Promise<boolean>;
  getCertificateUsage(certificateId: string): Promise<ConfigGroupUsage>;
}

// ---------------------------------------------------------------------------
// Aggregate — the full API surface consumed by the app
// ---------------------------------------------------------------------------

// Component storage (volume mounts, devops API). wip-only for now; cloud/icp stubs throw.
export interface StorageApi {
  listVolumes(orgUuid: string, projectId: string, environmentId: string): Promise<Volume[]>;
  createVolume(orgUuid: string, projectId: string, data: VolumeCreateData): Promise<Volume>;
  deleteVolume(orgUuid: string, projectId: string, volumeId: string): Promise<void>;
  listVolumeMounts(orgUuid: string, projectId: string, componentId: string, releaseId: string): Promise<VolumeMount[]>;
  createVolumeMount(orgUuid: string, projectId: string, path: VolumeMountPath, data: VolumeMountCreateData): Promise<VolumeMount>;
  updateVolumeMount(orgUuid: string, projectId: string, path: VolumeMountPath, mountId: string, data: VolumeMountUpdateData): Promise<VolumeMount>;
  deleteVolumeMount(orgUuid: string, projectId: string, path: VolumeMountPath, mountId: string): Promise<void>;
  listStorageClasses(orgUuid: string, projectId: string, environmentId: string): Promise<StorageClass[]>;
}

// Component scaling. The devops API methods are wip-only (the cloud stubs throw); the
// per-environment autoscaling methods are cloud-only (the wip stubs throw).
export interface ScalingApi {
  getAutoscaling(orgUuid: string, projectId: string, componentId: string, environmentId: string): Promise<Autoscaling>;
  updateAutoscaling(orgUuid: string, projectId: string, componentId: string, environmentId: string, data: AutoscalingWriteData): Promise<void>;
  getScalingState(orgUuid: string, projectId: string, componentId: string, releaseId: string): Promise<ScalingState>;
  getHttpScaler(orgUuid: string, projectId: string, componentId: string, releaseId: string): Promise<HttpScaler | null>;
  getHpa(orgUuid: string, projectId: string, componentId: string, releaseId: string): Promise<Hpa | null>;
  setScalingMethod(orgUuid: string, projectId: string, path: ScalingPath, data: ScalingMethodToggle): Promise<void>;
  updateHttpScaler(orgUuid: string, projectId: string, path: ScalingPath, data: HttpScalerWriteData): Promise<HttpScaler>;
  createHpa(orgUuid: string, projectId: string, path: ScalingPath, data: HpaWriteData): Promise<Hpa>;
  updateHpa(orgUuid: string, projectId: string, path: ScalingPath, hpaId: string, data: HpaWriteData): Promise<Hpa>;
  createHpaMetric(orgUuid: string, projectId: string, path: ScalingPath, hpaId: string, data: HpaMetric): Promise<HpaMetric>;
  updateHpaMetric(orgUuid: string, projectId: string, path: ScalingPath, hpaId: string, metricId: string, data: HpaMetric): Promise<HpaMetric>;
  deleteHpaMetric(orgUuid: string, projectId: string, path: ScalingPath, hpaId: string, metricId: string): Promise<void>;
  listPods(orgUuid: string, projectId: string, clusterId: string, releaseId: string): Promise<ClusterPod[]>;
  listPodMetrics(orgUuid: string, projectId: string, clusterId: string, releaseId: string): Promise<PodMetrics[]>;
}

// ---------------------------------------------------------------------------
// Data planes (Runtimes)
// ---------------------------------------------------------------------------

export interface DataPlanesApi {
  listDataPlanes(): Promise<Cluster[]>;
  listPdps(): Promise<PdpManagerPdp[]>;
}

// ---------------------------------------------------------------------------
// Component runtime (pods, metrics, redeploy)
// ---------------------------------------------------------------------------

export interface RuntimeApi {
  // componentId is a UUID (wip); componentName is the handler slug (cloud) — each
  // product's implementation uses whichever one its backend addresses releases by.
  fetchReleaseDetails(projectId: string, componentId: string, componentName: string, releaseId: string): Promise<RuntimeReleaseDetails>;
  fetchComponentPods(projectId: string, componentName: string, clusterId: string, releaseId: string, namespace: string): Promise<RuntimeClusterPod[]>;
  fetchComponentPodMetrics(projectId: string, componentName: string, clusterId: string, releaseId: string, namespace: string): Promise<RuntimeMetrics>;
  redeployRelease(projectId: string, componentId: string, componentName: string, releaseId: string, message?: string): Promise<void>;
  fetchPodEvents(projectId: string, componentName: string, releaseId: string, clusterId: string, namespace: string, podName: string): Promise<RuntimePodEvent[]>;
  fetchPodLogs(projectId: string, componentName: string, releaseId: string, clusterId: string, namespace: string, podName: string, options: RuntimePodLogOptions): Promise<string>;
}

export interface AppApi {
  alerts: AlertsApi;
  apim: ApimApi;
  artifactToggleMutations: ArtifactToggleMutationsApi;
  artifacts: ArtifactsApi;
  auth: AuthApi;
  builds: BuildsApi;
  cloudEditor: CloudEditorApi;
  components: ComponentsApi;
  configuration: ConfigurationApi;
  copilot: CopilotApi;
  deployments: DeploymentsApi;
  deploymentPipelines: DeploymentPipelinesApi;
  onPremKeys: OnPremKeysApi;
  appSecurity: AppSecurityApi;
  dataPlanes: DataPlanesApi;
  runtime: RuntimeApi;
  credentials: CredentialsApi;
  consumers: ConsumersApi;
  workflows: WorkflowsApi;
  egressControl: EgressControlApi;
  environments: EnvironmentsApi;
  executions: ExecutionsApi;
  insights: InsightsApi;
  logs: LogsApi;
  marketplace: MarketplaceApi;
  mcpProxy: McpProxyApi;
  org: OrgApi;
  prebuilt: PrebuiltApi;
  projects: ProjectsApi;
  projectAuthz: ProjectAuthzApi;
  tailscale: TailscaleApi;
  storage: StorageApi;
  scaling: ScalingApi;
  devopsConfigs: DevopsConfigsApi;
  externalCi: ExternalCiApi;
  healthChecks: HealthChecksApi;
  customDomains: CustomDomainsApi;
  repository: RepositoryApi;
  samples: SamplesApi;
  subscriptions: SubscriptionsApi;
  certificates: CertificatesApi;
  configGroups: ConfigGroupsApi;
  connections: ConnectionsApi;
  auditLogs: AuditLogsApi;
  platformServices: PlatformServicesApi;
  genaiServices: GenaiServicesApi;
  governance: GovernanceApi;
  ragBackend: RagBackendApi;
}
