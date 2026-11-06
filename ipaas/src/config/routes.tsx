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
import { cookiePolicyUrl, loginUrl, signupUrl } from '../paths';
import { ScopeResolver, generateMatrixRoutes, withScope, type Matrix } from '../nav';
import HiddenPageRedirect from '../components/HiddenPageRedirect';
import UnknownRoute from '../components/UnknownRoute';
import Logout from '../pages/Logout';
import { createElement } from 'react';
import { lazyPage } from './lazyPage';
const PrebuiltIntegrationConfigProvider = lazyPage(() => import('../contexts/PrebuiltIntegrationConfigContext').then((m) => ({ default: m.PrebuiltIntegrationConfigProvider })));

// Eager — needed on first paint for unauthenticated pages, and the authenticated
// shell (AppLayout) which must remain stable across route transitions.
import PublicLayout from '../layouts/PublicLayout';
import Login from '../pages/Login';
import RouteErrorBoundary from '../components/RouteErrorBoundary';
import AppLayout from '../layouts/AppLayout';

// Lazy — all pages inside the authenticated shell
const PolicyLayout = lazyPage(() => import('../layouts/PolicyLayout'));
const ProtectedRoute = lazyPage(() => import('../layouts/ProtectedRoute'));
const OrgHomeRedirect = lazyPage(() => import('../components/OrgHomeRedirect'));

const OIDCCallback = lazyPage(() => import('../pages/OIDCCallback'));
const VoiceAgents = lazyPage(() => import('../pages/VoiceAgents'));
const CreateVoiceAgent = lazyPage(() => import('../pages/CreateVoiceAgent'));
const CreateVoiceAgentOrg = lazyPage(() => import('../pages/CreateVoiceAgent').then((m) => ({ default: m.CreateVoiceAgentOrg })));
const EnableVoiceAgent = lazyPage(() => import('../pages/CreateVoiceAgent').then((m) => ({ default: m.EnableVoiceAgent })));
const GitHubOAuthCallback = lazyPage(() => import('../pages/GitHubOAuthCallback'));
const AzureDevOpsOAuthCallback = lazyPage(() => import('../pages/AzureDevOpsOAuthCallback'));
const CookiePolicy = lazyPage(() => import('../pages/CookiePolicy'));
const CloudEditorDeployment = lazyPage(() => import('../pages/CloudEditorDeployment'));
const ProjectsRedirect = lazyPage(() => import('../pages/ProjectsRedirect'));
const OrgHome = lazyPage(() => import('../pages/OrgHome'));
const Projects = lazyPage(() => import('../pages/Projects'));
const Project = lazyPage(() => import('../pages/Project'));
const Component = lazyPage(() => import('../pages/Component'));
const CreateProject = lazyPage(() => import('../pages/CreateProject'));
const ProjectManageRedirect = lazyPage(() => import('../pages/ProjectManageRedirect'));
const LinkRepository = lazyPage(() => import('../pages/LinkRepository'));
const ImportProject = lazyPage(() => import('../pages/ImportProject'));
const CreateIntegrationOptions = lazyPage(() => import('../pages/CreateIntegrationOptions'));
const AiIntegrationBuilderView = lazyPage(() => import('../pages/AiIntegrationBuilderView'));
const ImportIntegration = lazyPage(() => import('../pages/ImportIntegration'));
const McpProxyFromApi = lazyPage(() => import('../pages/McpProxyFromApi'));
const ComponentTest = lazyPage(() => import('../pages/ComponentTest'));
const OrgDataPlanes = lazyPage(() => import('../pages/OrgDataPlanes'));
const OrgDatabases = lazyPage(() => import('../pages/OrgDatabases'));
const UserPortal = lazyPage(() => import('../pages/UserPortal'));
const CreateDatabaseServer = lazyPage(() => import('../pages/CreateDatabaseServer'));
const DatabaseServerDetail = lazyPage(() => import('../pages/DatabaseServerDetail'));
const TemporalServerDetail = lazyPage(() => import('../pages/TemporalServerDetail'));
const OrgPackageRegistries = lazyPage(() => import('../pages/OrgPackageRegistries'));
const ComponentRuntime = lazyPage(() => import('../pages/ComponentRuntime'));
const ComponentConfigs = lazyPage(() => import('../pages/ComponentConfigs'));
const ComponentContainers = lazyPage(() => import('../pages/ComponentContainers'));
const ComponentHealthChecks = lazyPage(() => import('../pages/ComponentHealthChecks'));
const ComponentScaling = lazyPage(() => import('../pages/ComponentScaling'));
const ComponentWorkflows = lazyPage(() => import('../pages/ComponentWorkflows'));
const ComponentHumanTasks = lazyPage(() => import('../pages/ComponentHumanTasks'));
const ComponentDeploymentTracks = lazyPage(() => import('../pages/ComponentDeploymentTracks'));
const ComponentSettings = lazyPage(() => import('../pages/ComponentSettings'));
const OrgSettings = lazyPage(() => import('../pages/OrgSettings'));
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
const TestConsoleRoute = lazyPage(() => import('../pages/ComponentTest').then((m) => ({ default: m.TestConsoleRoute })));
const AgentChatTestRoute = lazyPage(() => import('../pages/ComponentTest').then((m) => ({ default: m.AgentChatTestRoute })));
const VoiceAgentTestRoute = lazyPage(() => import('../pages/ComponentTest').then((m) => ({ default: m.VoiceAgentTestRoute })));
const RuntimeLogsOrg = lazyPage(() => import('../pages/RuntimeLogsOrg'));
const RuntimeLogsProject = lazyPage(() => import('../pages/RuntimeLogsProject'));
const RuntimeLogsIntegration = lazyPage(() => import('../pages/RuntimeLogsIntegration'));
const Traces = lazyPage(() => import('../pages/Traces'));
const ApiInsights = lazyPage(() => import('../pages/ApiInsights'));
const ComingSoon = lazyPage(() => import('../pages/ComingSoon'));
const KnowledgeBases = lazyPage(() => import('../pages/KnowledgeBases'));
const CreateKnowledgeBase = lazyPage(() => import('../pages/CreateKnowledgeBase'));
const KnowledgeBaseDetails = lazyPage(() => import('../pages/KnowledgeBaseDetails'));
const AddKnowledgeBaseDataSource = lazyPage(() => import('../pages/AddKnowledgeBaseDataSource'));

export interface AppRoute extends Omit<RouteProps, 'children'> {
  children?: AppRoute[];
}

const MATRIX: Matrix = {
  overview: { segment: '', pages: { organizations: Projects, projects: Project, components: Component } },
  build: { segment: 'build', pages: { organizations: OrgBuild, projects: ProjectBuild, components: Build } },
  deploy: { segment: 'deploy', pages: { organizations: OrgDeploy, projects: ProjectDeploy, components: Deploy } },
  // Logs come from the wso2cloud observability proxy, not the BFF.
  logs: { segment: 'logs', pages: { organizations: RuntimeLogsOrg, projects: RuntimeLogsProject, components: RuntimeLogsIntegration } },
};

const routes: AppRoute[] = [
  { path: '/', element: <Navigate to="/login" replace /> },
  {
    element: <PublicLayout />,
    children: [
      { path: loginUrl(), element: <Login /> },
      // Thunder hosts sign-up on the same page as sign-in.
      { path: signupUrl(), element: <Navigate to={loginUrl()} replace /> },
    ],
  },
  {
    element: <PolicyLayout />,
    children: [{ path: cookiePolicyUrl(), element: <CookiePolicy /> }],
  },
  { path: '/signin', element: <OIDCCallback /> },
  { path: '/logout', element: <Logout /> },
  { path: '/ghapp', element: <GitHubOAuthCallback /> },
  { path: '/adoapp', element: <AzureDevOpsOAuthCallback /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/editor', element: <CloudEditorDeployment /> },
      {
        element: <ScopeResolver />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: 'organizations/:orgHandler', element: <OrgHomeRedirect /> },
              { path: 'organizations/:orgHandler/deploy', element: createElement(withScope(OrgDeploy, ['organizations'])) },
              { path: 'organizations/:orgHandler/test', element: createElement(withScope(OrgTest, ['organizations'])) },
              { path: 'organizations/:orgHandler/insights', element: createElement(withScope(ApiInsights, ['organizations'])) },
              { path: 'organizations/:orgHandler/voice-agents', element: createElement(withScope(VoiceAgents, ['organizations'])) },
              { path: 'organizations/:orgHandler/voice-agents/new', element: createElement(withScope(CreateVoiceAgentOrg, ['organizations'])) },
              { path: 'organizations/:orgHandler/metrics', element: <ComingSoon description="One view of throughput, latency and errors for every integration you run." /> },
              { path: 'organizations/:orgHandler/admin/data-planes', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgDataPlanes, ['organizations']))) },
              { path: 'organizations/:orgHandler/ai-services/knowledge-bases', element: createElement(withScope(KnowledgeBases, ['organizations'])) },
              { path: 'organizations/:orgHandler/ai-services/knowledge-bases/new', element: createElement(withScope(CreateKnowledgeBase, ['organizations'])) },
              { path: 'organizations/:orgHandler/ai-services/knowledge-bases/:knowledgeBase', element: createElement(withScope(KnowledgeBaseDetails, ['organizations'])) },
              { path: 'organizations/:orgHandler/ai-services/knowledge-bases/:knowledgeBase/data-sources/new', element: createElement(withScope(AddKnowledgeBaseDataSource, ['organizations'])) },
              { path: 'organizations/:orgHandler/platform-services', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgDatabases, ['organizations']))) },
              { path: 'organizations/:orgHandler/platform-services/new', element: createElement(RouteErrorBoundary, null, createElement(withScope(CreateDatabaseServer, ['organizations']))) },
              { path: 'organizations/:orgHandler/platform-services/:dbServerId', element: createElement(RouteErrorBoundary, null, createElement(withScope(DatabaseServerDetail, ['organizations']))) },
              { path: 'organizations/:orgHandler/platform-services/:dbServerId/:tab', element: createElement(RouteErrorBoundary, null, createElement(withScope(DatabaseServerDetail, ['organizations']))) },
              { path: 'organizations/:orgHandler/platform-services/temporal/:temporalId', element: createElement(RouteErrorBoundary, null, createElement(withScope(TemporalServerDetail, ['organizations']))) },
              { path: 'organizations/:orgHandler/platform-services/temporal/:temporalId/:tab', element: createElement(RouteErrorBoundary, null, createElement(withScope(TemporalServerDetail, ['organizations']))) },
              { path: 'organizations/:orgHandler/settings', element: createElement(withScope(OrgSettings, ['organizations'])) },
              { path: 'organizations/:orgHandler/settings/package-registries', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgPackageRegistries, ['organizations']))) },
              { path: 'organizations/:orgHandler/settings/user-portal', element: createElement(RouteErrorBoundary, null, createElement(withScope(UserPortal, ['organizations']))) },
              ...generateMatrixRoutes(MATRIX),
              { path: 'organizations/:orgHandler/projects/:projectHandler/deploy', element: createElement(withScope(ProjectDeploy, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/test', element: createElement(withScope(ProjectTest, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/runtimes', element: <ComingSoon title="Coming soon" description="Runtime management is currently under development." /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/metrics', element: <ComingSoon title="Coming soon" description="Metrics are currently under development." /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/observe/runtimelogs', element: createElement(withScope(RuntimeLogsProject, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/observe/metrics', element: <ComingSoon description="Throughput, latency and errors for every integration in the project." /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/edit', element: createElement(withScope(ProjectManageRedirect, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/link-repository', element: createElement(withScope(LinkRepository, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/redirect', element: <ProjectsRedirect /> },
              { path: 'organizations/:orgHandler/overview', element: createElement(withScope(OrgHome, ['organizations'])) },
              { path: 'organizations/:orgHandler/projects', element: createElement(withScope(Projects, ['organizations'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/home', element: createElement(withScope(Project, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/overview', element: createElement(withScope(Component, ['components'])) },
              { path: 'organizations/:orgHandler/create-project', element: createElement(withScope(CreateProject, ['organizations'])) },
              { path: 'organizations/:orgHandler/import-project', element: createElement(withScope(ImportProject, ['organizations'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new', element: createElement(withScope(CreateIntegrationOptions, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/ai-builder', element: createElement(withScope(AiIntegrationBuilderView, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/import', element: createElement(withScope(ImportIntegration, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/samples', element: createElement(withScope(BrowseSamples, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/voice-agent', element: createElement(withScope(CreateVoiceAgent, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/voice-agent/new', element: createElement(withScope(EnableVoiceAgent, ['components'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/generate-mcp', element: createElement(withScope(McpProxyFromApi, ['projects'])) },
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
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/new/import-coming-soon',
                element: <ComingSoon title="Coming soon" description="Importing from this Git provider is currently not available. You'll be able to import integrations from this source soon." />,
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/test',
                element: createElement(withScope(ComponentTest, ['components'])),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/test/console',
                element: createElement(withScope(TestConsoleRoute, ['components'])),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/test/agent-chat',
                element: createElement(withScope(AgentChatTestRoute, ['components'])),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/test/voice-agent',
                element: createElement(withScope(VoiceAgentTestRoute, ['components'])),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/test/api-chat',
                element: <ComingSoon title="Coming soon" description="API Chat is currently under development." />,
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/deploy',
                element: <ComingSoon title="Coming soon" description="Deployment management is currently under development." />,
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/metrics',
                element: <ComingSoon description="Throughput, latency and errors over time, per environment." />,
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/traces',
                element: createElement(RouteErrorBoundary, null, createElement(withScope(Traces, ['components']))),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/workflows',
                element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentWorkflows, ['components']))),
              },
              {
                // A run's execution view, opened by its run id.
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/workflows/:runId',
                element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentWorkflows, ['components']))),
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/human-tasks',
                element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentHumanTasks, ['components']))),
              },
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
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/settings', element: createElement(withScope(ComponentSettings, ['components'])) },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/settings/deployment-tracks',
                element: createElement(RouteErrorBoundary, null, createElement(withScope(ComponentDeploymentTracks, ['components']))),
              },
              // Unknown or retired pages (including the unported ones) go back to their level's home.
              { path: 'organizations/:orgHandler/*', element: <HiddenPageRedirect level="organizations" /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/*', element: <HiddenPageRedirect level="projects" /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/*', element: <HiddenPageRedirect level="components" /> },
            ],
          },
        ],
      },
    ],
  },
  // Anything no route above claims: sign in when signed out, otherwise a not-found page.
  { path: '*', element: <UnknownRoute /> },
];

export default routes;
