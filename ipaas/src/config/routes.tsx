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

import { type RouteProps, Navigate, Outlet } from 'react-router';
import { cookiePolicyUrl, loginUrl, orgRoleDetailUrl, projectRoleDetailUrl, componentRoleDetailUrl, projectGroupDetailUrl, componentGroupDetailUrl, signupUrl, registerOrgUrl } from '../paths';
import { ScopeResolver, generateMatrixRoutes, withScope, type Level, type Matrix } from '../nav';
import HiddenPageRedirect, { HiddenIntegrationPage, HiddenOrgPage, HiddenProjectPage } from '../components/HiddenPageRedirect';
import { IS_WIP, IS_CLOUD } from '../features';
import { createElement } from 'react';
import { lazyPage } from './lazyPage';
const PrebuiltIntegrationConfigProvider = lazyPage(() => import('../contexts/PrebuiltIntegrationConfigContext').then((m) => ({ default: m.PrebuiltIntegrationConfigProvider })));

// Eager — needed on first paint for unauthenticated pages, and the authenticated
// shell (AppLayout) which must remain stable across route transitions.
import PublicLayout from '../layouts/PublicLayout';
import Login from '../pages/Login';
import Signup from '../pages/Signup';
import RouteErrorBoundary from '../components/RouteErrorBoundary';
import AppLayout from '../layouts/AppLayout';

// Lazy — all pages inside the authenticated shell
const PolicyLayout = lazyPage(() => import('../layouts/PolicyLayout'));
const ProtectedRoute = lazyPage(() => import('../auth/ProtectedRoute'));
const OrgHomeRedirect = lazyPage(() => import('../components/OrgHomeRedirect'));

const OIDCCallback = lazyPage(() => import('../pages/OIDCCallback'));
const GitHubOAuthCallback = lazyPage(() => import('../pages/GitHubOAuthCallback'));
const RegisterOrganization = lazyPage(() => import('../pages/RegisterOrganization'));
const CookiePolicy = lazyPage(() => import('../pages/CookiePolicy'));
const ForceChangePassword = lazyPage(() => import('../pages/ForceChangePassword'));
const CloudEditorDeployment = lazyPage(() => import('../pages/CloudEditorDeployment'));
const ProjectsRedirect = lazyPage(() => import('../pages/ProjectsRedirect'));
const OrgHome = lazyPage(() => import('../pages/OrgHome'));
const Projects = lazyPage(() => import('../pages/Projects'));
const Project = lazyPage(() => import('../pages/Project'));
const Component = lazyPage(() => import('../pages/Component'));
const ComponentIntegration = lazyPage(() => import('../pages/ComponentIntegration'));
const ComponentApiInfo = lazyPage(() => import('../pages/ComponentApiInfo'));
const CreateProject = lazyPage(() => import('../pages/CreateProject'));
const ImportProject = lazyPage(() => import('../pages/ImportProject'));
const CreateIntegrationOptions = lazyPage(() => import('../pages/CreateIntegrationOptions'));
const AiIntegrationBuilderView = lazyPage(() => import('../pages/AiIntegrationBuilderView'));
const ImportIntegration = lazyPage(() => import('../pages/ImportIntegration'));
const McpProxyFromApi = lazyPage(() => import('../pages/McpProxyFromApi'));
const McpPolicies = lazyPage(() => import('../pages/McpPolicies'));
const ComponentTest = lazyPage(() => import('../pages/ComponentTest'));
const OrgCdPipelines = lazyPage(() => import('../pages/OrgCdPipelines'));
const OrgConfigGroups = lazyPage(() => import('../pages/OrgConfigGroups'));
const CreateConfigGroup = lazyPage(() => import('../pages/CreateConfigGroup'));
const OrgGovernance = lazyPage(() => import('../pages/OrgGovernance'));
const CreatePolicy = lazyPage(() => import('../pages/CreatePolicy'));
const CreateRuleset = lazyPage(() => import('../pages/CreateRuleset'));
const CreateDocument = lazyPage(() => import('../pages/CreateDocument'));
const CreateAiPolicy = lazyPage(() => import('../pages/CreateAiPolicy'));
const OrgGenAIServices = lazyPage(() => import('../pages/OrgGenAIServices'));
const RegisterGenAIService = lazyPage(() => import('../pages/RegisterGenAIService'));
const GenAIServiceDetail = lazyPage(() => import('../pages/GenAIServiceDetail'));
const ThirdPartyServices = lazyPage(() => import('../pages/ThirdPartyServices'));
const RegisterThirdPartyService = lazyPage(() => import('../pages/RegisterThirdPartyService'));
const ThirdPartyServiceDetail = lazyPage(() => import('../pages/ThirdPartyServiceDetail'));
const EditConfigGroup = lazyPage(() => import('../pages/EditConfigGroup'));
const OrgAuditLogs = lazyPage(() => import('../pages/OrgAuditLogs'));
const ProjectCdPipelines = lazyPage(() => import('../pages/ProjectCdPipelines'));
const OrgDatabases = lazyPage(() => import('../pages/OrgDatabases'));
const OrgDataPlanes = lazyPage(() => import('../pages/OrgDataPlanes'));
const OrgPackageRegistries = lazyPage(() => import('../pages/OrgPackageRegistries'));
const OrgDetails = lazyPage(() => import('../pages/OrgDetails'));
const ComponentRuntime = lazyPage(() => import('../pages/ComponentRuntime'));
const OrgApprovals = lazyPage(() => import('../pages/OrgApprovals'));
const CreateDatabaseServer = lazyPage(() => import('../pages/CreateDatabaseServer'));
const DatabaseServerDetail = lazyPage(() => import('../pages/DatabaseServerDetail'));
const SetupRagIngestion = lazyPage(() => import('../pages/SetupRagIngestion'));
const SetupRagService = lazyPage(() => import('../pages/SetupRagService'));
const RagRetrieval = lazyPage(() => import('../pages/RagRetrieval'));
const OrgVectorDatabases = lazyPage(() => import('../pages/OrgVectorDatabases'));
const CreateVectorDatabaseServer = lazyPage(() => import('../pages/CreateVectorDatabaseServer'));
const VectorDatabaseServerDetail = lazyPage(() => import('../pages/VectorDatabaseServerDetail'));
const OrgMessageBrokers = lazyPage(() => import('../pages/OrgMessageBrokers'));
const CreateMessageBroker = lazyPage(() => import('../pages/CreateMessageBroker'));
const MessageBrokerDetail = lazyPage(() => import('../pages/MessageBrokerDetail'));
const ProjectSettings = lazyPage(() => import('../pages/ProjectSettings'));
const ProjectOverview = lazyPage(() => import('../pages/ProjectOverview'));
const ProjectInsights = lazyPage(() => import('../pages/ProjectInsights'));
const OrgInsights = lazyPage(() => import('../pages/OrgInsights'));
import DeliveryInsights from '../pages/DeliveryInsights';
import ConfigureDelivery from '../pages/ConfigureDelivery';
import ComponentMetrics from '../pages/ComponentMetrics';
import ProjectMetrics from '../pages/ProjectMetrics';
const ComponentInsightsUsage = lazyPage(() => import('../pages/ComponentInsightsUsage'));
const ProjectEgressControl = lazyPage(() => import('../pages/ProjectEgressControl'));
const ProjectApplicationSecurity = lazyPage(() => import('../pages/ProjectApplicationSecurity'));
const ProjectVpnConfiguration = lazyPage(() => import('../pages/ProjectVpnConfiguration'));
const ComponentSettings = lazyPage(() => import('../pages/ComponentSettings'));
const ComponentDeploymentTracks = lazyPage(() => import('../pages/ComponentDeploymentTracks'));
const ComponentProxyVersions = lazyPage(() => import('../pages/ComponentProxyVersions'));
const ComponentUrlSettings = lazyPage(() => import('../pages/ComponentUrlSettings'));
const ComponentConfigs = lazyPage(() => import('../pages/ComponentConfigs'));
const ComponentExternalCI = lazyPage(() => import('../pages/ComponentExternalCI'));
const ComponentContainers = lazyPage(() => import('../pages/ComponentContainers'));
const ComponentHealthChecks = lazyPage(() => import('../pages/ComponentHealthChecks'));
const CdPipelineEditor = lazyPage(() => import('../pages/CdPipelineEditor'));
const OrgSettings = lazyPage(() => import('../pages/OrgSettings'));
const OnPremKeys = lazyPage(() => import('../pages/OnPremKeys'));
const EgressControl = lazyPage(() => import('../pages/EgressControl'));
const Workflows = lazyPage(() => import('../pages/Workflows'));
const ApplicationSecurity = lazyPage(() => import('../pages/ApplicationSecurity'));
const Credentials = lazyPage(() => import('../pages/Credentials'));
const BrowseSamples = lazyPage(() => import('../pages/BrowseSamples'));
const BrowsePrebuiltIntegrations = lazyPage(() => import('../pages/BrowsePrebuiltIntegrations'));
const PrebuiltIntegrationSetup = lazyPage(() => import('../pages/PrebuiltIntegrationSetup'));
const PrebuiltIntegrationDeploy = lazyPage(() => import('../pages/PrebuiltIntegrationDeploy'));
const Build = lazyPage(() => import('../pages/Build'));
const OrgBuild = lazyPage(() => import('../pages/OrgBuild'));
const ProjectBuild = lazyPage(() => import('../pages/ProjectBuild'));
const OrgTest = lazyPage(() => import('../pages/OrgTest'));
const ProjectTest = lazyPage(() => import('../pages/ProjectTest'));
const OrgDeploy = lazyPage(() => import('../pages/OrgDeploy'));
const ProjectDeploy = lazyPage(() => import('../pages/ProjectDeploy'));
const Deploy = lazyPage(() => import('../pages/Deploy'));
const TestConsole = lazyPage(() => import('../pages/TestConsole'));
const AgentChatTestRoute = lazyPage(() => import('../pages/ComponentTest').then((m) => ({ default: m.AgentChatTestRoute })));
const Lifecycle = lazyPage(() => import('../pages/Lifecycle'));
const OrgCompliance = lazyPage(() => import('../pages/OrgCompliance'));
const ProjectCompliance = lazyPage(() => import('../pages/ProjectCompliance'));
const ComponentCompliance = lazyPage(() => import('../pages/ComponentCompliance'));
const Alerts = lazyPage(() => import('../pages/Alerts'));
const Environments = lazyPage(() => import('../pages/Environments'));
const CreateEnvironment = lazyPage(() => import('../pages/CreateEnvironment'));
const EditEnvironment = lazyPage(() => import('../pages/EditEnvironment'));
const RuntimeLogsProject = lazyPage(() => import('../pages/RuntimeLogsProject'));
const RuntimeLogsIntegration = lazyPage(() => import('../pages/RuntimeLogsIntegration'));
const { OrgAccessControl, ProjectAccessControl, ComponentAccessControl } = {
  OrgAccessControl: lazyPage(() => import('../pages/AccessControl').then((m) => ({ default: m.OrgAccessControl }))),
  ProjectAccessControl: lazyPage(() => import('../pages/AccessControl').then((m) => ({ default: m.ProjectAccessControl }))),
  ComponentAccessControl: lazyPage(() => import('../pages/AccessControl').then((m) => ({ default: m.ComponentAccessControl }))),
};
const RoleDetail = lazyPage(() => import('../pages/RoleDetail'));
const ProjectRoleDetail = lazyPage(() => import('../pages/ProjectRoleDetail'));
const ComponentRoleDetail = lazyPage(() => import('../pages/ComponentRoleDetail'));
const ProjectGroupDetail = lazyPage(() => import('../pages/ProjectGroupDetail'));
const ComponentGroupDetail = lazyPage(() => import('../pages/ComponentGroupDetail'));
const CreateUser = lazyPage(() => import('../pages/CreateUser'));
const EditUser = lazyPage(() => import('../pages/EditUser'));
const CreateRole = lazyPage(() => import('../pages/CreateRole'));
const CreateGroup = lazyPage(() => import('../pages/CreateGroup'));
const EditGroup = lazyPage(() => import('../pages/EditGroup'));
const Profile = lazyPage(() => import('../pages/Profile'));
const ComingSoon = lazyPage(() => import('../pages/ComingSoon'));
const ProjectConnections = lazyPage(() => import('../pages/ProjectConnections'));
const ComponentConnections = lazyPage(() => import('../pages/ComponentConnections'));
const ComponentStorage = lazyPage(() => import('../pages/ComponentStorage'));
const ComponentScaling = lazyPage(() => import('../pages/ComponentScaling'));
const NewConnection = lazyPage(() => import('../pages/NewConnection'));
const ConnectionDetail = lazyPage(() => import('../pages/ConnectionDetail'));
const ComponentPlans = lazyPage(() => import('../pages/ComponentPlans'));
const OrgCertificates = lazyPage(() => import('../pages/OrgCertificates'));
const CreateCertificate = lazyPage(() => import('../pages/CreateCertificate'));
const CertificateDetail = lazyPage(() => import('../pages/CertificateDetail'));
const ComponentDocuments = lazyPage(() => import('../pages/ComponentDocuments'));

export interface AppRoute extends Omit<RouteProps, 'children'> {
  children?: AppRoute[];
}

/** Registers `paths` as real routes, or as redirects when `hidden`. */
function hideable(hidden: boolean, level: Level, routes: AppRoute[]): AppRoute[] {
  if (!hidden) return routes;
  return routes.map((r) => ({ path: r.path, element: <HiddenPageRedirect level={level} /> }));
}

const MATRIX: Matrix = {
  overview: { segment: '', pages: { organizations: Projects, projects: Project, components: Component } },
  build: { segment: 'build', pages: { organizations: OrgBuild, projects: ProjectBuild, components: Build } },
  deploy: { segment: 'deploy', pages: { organizations: OrgDeploy, projects: ProjectDeploy, components: Deploy } },
  // Hidden on cloud; the matrix slot still needs a page, so it redirects.
  alerts: { segment: 'alerts', pages: { components: IS_CLOUD ? HiddenIntegrationPage : Alerts } },
  logs: { segment: 'logs', pages: { projects: RuntimeLogsProject, components: RuntimeLogsIntegration } },

  environments: { segment: 'environments', pages: { organizations: Environments, projects: Environments } },
  // Cloud hides org and project Access Control; the matrix slots still need a page, so they redirect.
  'access-control': {
    segment: 'settings/access-control/:tab',
    pages: { organizations: IS_CLOUD ? HiddenOrgPage : OrgAccessControl, projects: IS_CLOUD ? HiddenProjectPage : ProjectAccessControl, components: ComponentAccessControl },
  },
};

const routes: AppRoute[] = [
  { path: '/', element: <Navigate to="/login" replace /> },
  {
    element: <PublicLayout />,
    children: [
      { path: loginUrl(), element: <Login /> },
      { path: signupUrl(), element: <Signup /> },
    ],
  },
  {
    element: <PolicyLayout />,
    children: [{ path: cookiePolicyUrl(), element: <CookiePolicy /> }],
  },
  { path: '/signin', element: <OIDCCallback /> },
  { path: '/ghapp', element: <GitHubOAuthCallback /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: registerOrgUrl(), element: <RegisterOrganization /> },
      { path: '/change-password', element: <ForceChangePassword /> },
      { path: '/editor', element: <CloudEditorDeployment /> },
      {
        element: <ScopeResolver />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: 'organizations/:orgHandler', element: <OrgHomeRedirect /> },
              ...hideable(IS_CLOUD, 'organizations', [{ path: 'organizations/:orgHandler/develop', element: <ComingSoon title="Coming Soon" description="Development tools are currently under development." /> }]),
              { path: 'organizations/:orgHandler/deploy', element: createElement(withScope(OrgDeploy, ['organizations'])) },
              { path: 'organizations/:orgHandler/test', element: createElement(withScope(OrgTest, ['organizations'])) },
              ...hideable(IS_CLOUD, 'organizations', [
                { path: 'organizations/:orgHandler/insights/usage', element: createElement(withScope(OrgInsights, ['organizations'])) },
                { path: 'organizations/:orgHandler/insights/delivery', element: createElement(withScope(DeliveryInsights, ['organizations'])) },
                { path: 'organizations/:orgHandler/insights/delivery/configure', element: createElement(withScope(ConfigureDelivery, ['organizations'])) },
                { path: 'organizations/:orgHandler/insights/compliance', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgCompliance, ['organizations']))) },
              ]),
              { path: 'organizations/:orgHandler/logs', element: <ComingSoon title="Coming Soon" description="Organization-level logs are currently under development." /> },
              { path: 'organizations/:orgHandler/metrics', element: <ComingSoon title="Coming Soon" description="Organization-level metrics are currently under development." /> },
              { path: 'organizations/:orgHandler/rag/scheduled-ingestion', element: createElement(withScope(SetupRagIngestion, ['organizations'])) },
              { path: 'organizations/:orgHandler/rag/service', element: createElement(withScope(SetupRagService, ['organizations'])) },
              { path: 'organizations/:orgHandler/rag/retrieval', element: createElement(withScope(RagRetrieval, ['organizations'])) },
              ...hideable(IS_CLOUD, 'organizations', [
                { path: 'organizations/:orgHandler/admin/databases', element: createElement(withScope(OrgDatabases, ['organizations'])) },
                { path: 'organizations/:orgHandler/admin/databases/new', element: createElement(withScope(CreateDatabaseServer, ['organizations'])) },
                { path: 'organizations/:orgHandler/admin/databases/:dbServerId/:tab', element: createElement(withScope(DatabaseServerDetail, ['organizations'])) },
                { path: 'organizations/:orgHandler/admin/vector-databases', element: createElement(withScope(OrgVectorDatabases, ['organizations'])) },
                { path: 'organizations/:orgHandler/admin/vector-databases/new', element: createElement(withScope(CreateVectorDatabaseServer, ['organizations'])) },
                { path: 'organizations/:orgHandler/admin/vector-databases/:dbServerId/:tab', element: createElement(withScope(VectorDatabaseServerDetail, ['organizations'])) },
                { path: 'organizations/:orgHandler/admin/message-brokers', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgMessageBrokers, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/message-brokers/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreateMessageBroker, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/message-brokers/:brokerId/:tab', element: createElement(RouteErrorBoundary, null, createElement(withScope(MessageBrokerDetail, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/third-party', element: createElement(RouteErrorBoundary, null, createElement(withScope(ThirdPartyServices, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/third-party/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(RegisterThirdPartyService, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/third-party/:serviceId', element: createElement(RouteErrorBoundary, null, createElement(withScope(ThirdPartyServiceDetail, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/genai-services', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgGenAIServices, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/genai-services/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(RegisterGenAIService, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/genai-services/:serviceId', element: createElement(RouteErrorBoundary, null, createElement(withScope(GenAIServiceDetail, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/config-groups', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgConfigGroups, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/config-groups/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreateConfigGroup, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/config-groups/:configGroupUuid', element: createElement(RouteErrorBoundary, null, createElement(withScope(EditConfigGroup, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/governance', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgGovernance, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/governance/policies/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreatePolicy, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/governance/policies/:policyId', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreatePolicy, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/governance/ai-policies/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreateAiPolicy, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/governance/ai-policies/:policyId', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreateAiPolicy, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/governance/rulesets/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreateRuleset, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/governance/rulesets/:rulesetId', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreateRuleset, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/governance/documents/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreateDocument, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/governance/documents/:documentId', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreateDocument, ['organizations']))) },
              ]),
              { path: 'organizations/:orgHandler/admin/cd-pipelines', element: createElement(withScope(OrgCdPipelines, ['organizations'])) },
              { path: 'organizations/:orgHandler/admin/cd-pipelines/new', element: <CdPipelineEditor /> },
              { path: 'organizations/:orgHandler/admin/cd-pipelines/:pipelineId/edit', element: <CdPipelineEditor /> },
              { path: 'organizations/:orgHandler/admin/data-planes', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgDataPlanes, ['organizations']))) },
              ...hideable(IS_CLOUD, 'organizations', [
                { path: 'organizations/:orgHandler/admin/audit-logs', element: <OrgAuditLogs /> },
                { path: 'organizations/:orgHandler/admin/approvals', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgApprovals, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/certificates', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgCertificates, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/certificates/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreateCertificate, ['organizations']))) },
                { path: 'organizations/:orgHandler/admin/certificates/:certificateId', element: createElement(RouteErrorBoundary, null, createElement(withScope(CertificateDetail, ['organizations']))) },
              ]),
              { path: 'organizations/:orgHandler/settings', element: createElement(withScope(OrgSettings, ['organizations'])) },
              ...(IS_CLOUD
                ? [
                    { path: 'organizations/:orgHandler/settings/package-registries', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgPackageRegistries, ['organizations']))) },
                    { path: 'organizations/:orgHandler/settings/org-details', element: createElement(withScope(OrgDetails, ['organizations'])) },
                  ]
                : []),
              ...hideable(IS_CLOUD, 'organizations', [
                { path: 'organizations/:orgHandler/settings/egress-control', element: createElement(withScope(EgressControl, ['organizations'])) },
                { path: 'organizations/:orgHandler/settings/workflows', element: createElement(withScope(Workflows, ['organizations'])) },
                { path: 'organizations/:orgHandler/settings/credentials', element: createElement(withScope(Credentials, ['organizations'])) },
                { path: 'organizations/:orgHandler/settings/on-prem-keys', element: createElement(withScope(OnPremKeys, ['organizations'])) },
                { path: 'organizations/:orgHandler/settings/application-security/:tab', element: createElement(withScope(ApplicationSecurity, ['organizations'])) },
              ]),
              ...generateMatrixRoutes(MATRIX),
              ...hideable(IS_CLOUD, 'projects', [{ path: 'organizations/:orgHandler/projects/:projectHandler/develop', element: <ComingSoon title="Coming Soon" description="Development tools are currently under development." /> }]),
              { path: 'organizations/:orgHandler/projects/:projectHandler/deploy', element: createElement(withScope(ProjectDeploy, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/test', element: createElement(withScope(ProjectTest, ['projects'])) },
              ...hideable(IS_CLOUD, 'projects', [
                { path: 'organizations/:orgHandler/projects/:projectHandler/insights/usage', element: createElement(withScope(ProjectInsights, ['projects'])) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/insights/delivery', element: createElement(withScope(DeliveryInsights, ['projects'])) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/insights/delivery/configure', element: createElement(withScope(ConfigureDelivery, ['projects'])) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/insights/compliance', element: createElement(RouteErrorBoundary, null, createElement(withScope(ProjectCompliance, ['projects']))) },
              ]),
              { path: 'organizations/:orgHandler/projects/:projectHandler/runtimes', element: <ComingSoon title="Coming Soon" description="Runtime management is currently under development." /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/metrics', element: <ComingSoon title="Coming Soon" description="Metrics are currently under development." /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/observe/runtimelogs', element: createElement(withScope(RuntimeLogsProject, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/observe/metrics', element: createElement(withScope(ProjectMetrics, ['projects'])) },
              ...hideable(IS_CLOUD, 'projects', [
                { path: 'organizations/:orgHandler/projects/:projectHandler/admin/connections', element: createElement(RouteErrorBoundary, null, createElement(withScope(ProjectConnections, ['projects']))) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/admin/connections/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(NewConnection, ['projects']))) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/admin/connections/:connectionId', element: createElement(RouteErrorBoundary, null, createElement(withScope(ConnectionDetail, ['projects']))) },
              ]),
              ...hideable(IS_CLOUD, 'projects', [
                { path: 'organizations/:orgHandler/projects/:projectHandler/admin/third-party-services', element: createElement(RouteErrorBoundary, null, createElement(withScope(ThirdPartyServices, ['projects']))) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/admin/third-party-services/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(RegisterThirdPartyService, ['projects']))) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/admin/third-party-services/:serviceId', element: createElement(RouteErrorBoundary, null, createElement(withScope(ThirdPartyServiceDetail, ['projects']))) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/admin/gen-ai-services', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgGenAIServices, ['projects']))) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/admin/gen-ai-services/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(RegisterGenAIService, ['projects']))) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/admin/gen-ai-services/:serviceId', element: createElement(RouteErrorBoundary, null, createElement(withScope(GenAIServiceDetail, ['projects']))) },
              ]),
              { path: 'organizations/:orgHandler/projects/:projectHandler/admin/cd-pipelines', element: createElement(withScope(ProjectCdPipelines, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/devops/environments', element: createElement(withScope(Environments, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/settings', element: createElement(withScope(ProjectSettings, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/settings/project-overview', element: createElement(withScope(ProjectOverview, ['projects'])) },
              ...hideable(IS_CLOUD, 'projects', [
                { path: 'organizations/:orgHandler/projects/:projectHandler/settings/egress-control', element: createElement(withScope(ProjectEgressControl, ['projects'])) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/settings/application-security', element: createElement(withScope(ProjectApplicationSecurity, ['projects'])) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/settings/vpn-configuration', element: createElement(withScope(ProjectVpnConfiguration, ['projects'])) },
              ]),
              { path: 'organizations/:orgHandler/projects/redirect', element: <ProjectsRedirect /> },
              { path: 'organizations/:orgHandler/home', element: createElement(withScope(OrgHome, ['organizations'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/home', element: createElement(withScope(Project, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/overview', element: createElement(withScope(Component, ['components'])) },
              ...hideable(IS_CLOUD, 'components', [
                { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/develop/integration', element: createElement(withScope(ComponentIntegration, ['components'])) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/manage/api-info', element: createElement(withScope(ComponentApiInfo, ['components'])) },
              ]),
              { path: 'organizations/:orgHandler/projects/new', element: createElement(withScope(CreateProject, ['organizations'])) },
              { path: 'organizations/:orgHandler/projects/import', element: createElement(withScope(ImportProject, ['organizations'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new', element: createElement(withScope(CreateIntegrationOptions, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/ai-builder', element: createElement(withScope(AiIntegrationBuilderView, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/import', element: createElement(withScope(ImportIntegration, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/samples', element: createElement(withScope(BrowseSamples, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/generate-mcp', element: createElement(withScope(McpProxyFromApi, ['projects'])) },
              { path: 'organizations/:orgHandler/environments/new', element: createElement(withScope(CreateEnvironment, ['organizations'])) },
              { path: 'organizations/:orgHandler/environments/:envId/edit', element: <EditEnvironment /> },
              ...hideable(IS_CLOUD, 'organizations', [
                { path: 'organizations/:orgHandler/settings/access-control/users/new', element: <CreateUser /> },
                { path: 'organizations/:orgHandler/settings/access-control/users/:userId/edit', element: <EditUser /> },
                { path: 'organizations/:orgHandler/settings/access-control/roles/new', element: <CreateRole /> },
                { path: 'organizations/:orgHandler/settings/access-control/groups/new', element: <CreateGroup /> },
                { path: 'organizations/:orgHandler/settings/access-control/groups/:groupId/edit', element: <EditGroup /> },
              ]),
              { path: orgRoleDetailUrl(':orgHandler', ':roleId'), element: <RoleDetail /> },
              { path: projectRoleDetailUrl(':orgHandler', ':projectHandler', ':roleId'), element: <ProjectRoleDetail /> },
              { path: componentRoleDetailUrl(':orgHandler', ':projectHandler', ':componentHandler', ':roleId'), element: <ComponentRoleDetail /> },
              { path: projectGroupDetailUrl(':orgHandler', ':projectHandler', ':groupId'), element: <ProjectGroupDetail /> },
              { path: componentGroupDetailUrl(':orgHandler', ':projectHandler', ':componentHandler', ':groupId'), element: <ComponentGroupDetail /> },
              { path: '/profile', element: <Profile /> },
              // cloud: prebuilt integrations are supported on OpenChoreo, so the
              // routes are enabled for cloud as well as wip (icp is stubs-only).
              ...(IS_WIP || IS_CLOUD
                ? [
                    { path: 'organizations/:orgHandler/projects/:projectHandler/prebuilt-integrations', element: createElement(withScope(BrowsePrebuiltIntegrations, ['projects'])) },
                    {
                      element: (
                        <PrebuiltIntegrationConfigProvider>
                          <Outlet />
                        </PrebuiltIntegrationConfigProvider>
                      ),
                      children: [
                        { path: 'organizations/:orgHandler/projects/:projectHandler/prebuilt-integrations/:slug', element: createElement(withScope(PrebuiltIntegrationSetup, ['projects'])) },
                        { path: 'organizations/:orgHandler/projects/:projectHandler/prebuilt-integrations/:slug/deploy', element: createElement(withScope(PrebuiltIntegrationDeploy, ['projects'])) },
                      ],
                    },
                  ]
                : []),
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/new/import-coming-soon',
                element: <ComingSoon title="Coming Soon" description="Importing from this Git provider is currently not available. You'll be able to import integrations from this source soon." />,
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/test',
                element: createElement(withScope(ComponentTest, ['components'])),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/test/console',
                element: createElement(withScope(TestConsole, ['components'])),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/test/agent-chat',
                element: createElement(withScope(AgentChatTestRoute, ['components'])),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/test/api-chat',
                element: <ComingSoon title="Coming Soon" description="API Chat is currently under development." />,
              },
              ...hideable(IS_CLOUD, 'components', [
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/manage/lifecycle',
                  element: createElement(withScope(Lifecycle, ['components'])),
                },
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/manage/policies',
                  element: createElement(withScope(McpPolicies, ['components'])),
                },
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/document',
                  element: createElement(withScope(ComponentDocuments, ['components'])),
                },
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/manage/usage',
                  element: createElement(withScope(ComponentPlans, ['components'])),
                },
              ]),
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/deploy',
                element: <ComingSoon title="Coming Soon" description="Deployment management is currently under development." />,
              },
              ...hideable(IS_CLOUD, 'components', [
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/insights/usage',
                  element: createElement(withScope(ComponentInsightsUsage, ['components'])),
                },
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/insights/delivery',
                  element: <ComingSoon title="Coming Soon" description="Component delivery insights will be available soon. In the meantime, you can check project delivery insights." />,
                },
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/insights/compliance',
                  element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentCompliance, ['components']))),
                },
              ]),
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/metrics',
                element: createElement(withScope(ComponentMetrics, ['components'])),
              },
              ...hideable(IS_CLOUD, 'components', [
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/admin/connections',
                  element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentConnections, ['components']))),
                },
                { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/admin/connections/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(NewConnection, ['components']))) },
                { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/admin/connections/:connectionId', element: createElement(RouteErrorBoundary, null, createElement(withScope(ConnectionDetail, ['components']))) },
              ]),
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/runtimes',
                element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentRuntime, ['components']))),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/admin/containers',
                element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentContainers, ['components']))),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/admin/configs',
                element: createElement(withScope(ComponentConfigs, ['components'])),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/admin/health-checks',
                element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentHealthChecks, ['components']))),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/admin/scaling',
                element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentScaling, ['components']))),
              },
              ...hideable(IS_CLOUD, 'components', [
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/admin/storage',
                  element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentStorage, ['components']))),
                },
              ]),
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/admin/external-ci',
                element: createElement(withScope(ComponentExternalCI, ['components'])),
              },
              ...hideable(IS_CLOUD, 'components', [
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/settings',
                  element: createElement(withScope(ComponentSettings, ['components'])),
                },
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/settings/deployment-tracks',
                  element: createElement(withScope(ComponentDeploymentTracks, ['components'])),
                },
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/settings/proxy-versions',
                  element: createElement(withScope(ComponentProxyVersions, ['components'])),
                },
                {
                  path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/settings/url-settings',
                  element: createElement(withScope(ComponentUrlSettings, ['components'])),
                },
              ]),
            ],
          },
        ],
      },
    ],
  },
];

export default routes;
