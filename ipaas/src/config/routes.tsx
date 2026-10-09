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
import { cookiePolicyUrl, loginUrl, signupUrl, registerOrgUrl } from '../paths';
import { ScopeResolver, generateMatrixRoutes, withScope, type Matrix } from '../nav';
import HiddenPageRedirect from '../components/HiddenPageRedirect';
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
const ProtectedRoute = lazyPage(() => import('../layouts/ProtectedRoute'));
const OrgHomeRedirect = lazyPage(() => import('../components/OrgHomeRedirect'));

const OIDCCallback = lazyPage(() => import('../pages/OIDCCallback'));
const GitHubOAuthCallback = lazyPage(() => import('../pages/GitHubOAuthCallback'));
const RegisterOrganization = lazyPage(() => import('../pages/RegisterOrganization'));
const CookiePolicy = lazyPage(() => import('../pages/CookiePolicy'));
const CloudEditorDeployment = lazyPage(() => import('../pages/CloudEditorDeployment'));
const ForceChangePassword = lazyPage(() => import('../pages/ForceChangePassword'));
const ProjectsRedirect = lazyPage(() => import('../pages/ProjectsRedirect'));
const OrgHome = lazyPage(() => import('../pages/OrgHome'));
const Projects = lazyPage(() => import('../pages/Projects'));
const Project = lazyPage(() => import('../pages/Project'));
const Component = lazyPage(() => import('../pages/Component'));
const CreateProject = lazyPage(() => import('../pages/CreateProject'));
const ImportProject = lazyPage(() => import('../pages/ImportProject'));
const CreateIntegrationOptions = lazyPage(() => import('../pages/CreateIntegrationOptions'));
const AiIntegrationBuilderView = lazyPage(() => import('../pages/AiIntegrationBuilderView'));
const ImportIntegration = lazyPage(() => import('../pages/ImportIntegration'));
const McpProxyFromApi = lazyPage(() => import('../pages/McpProxyFromApi'));
const ComponentTest = lazyPage(() => import('../pages/ComponentTest'));
const OrgCdPipelines = lazyPage(() => import('../pages/OrgCdPipelines'));
const ProjectCdPipelines = lazyPage(() => import('../pages/ProjectCdPipelines'));
const OrgDataPlanes = lazyPage(() => import('../pages/OrgDataPlanes'));
const OrgPackageRegistries = lazyPage(() => import('../pages/OrgPackageRegistries'));
const OrgDetails = lazyPage(() => import('../pages/OrgDetails'));
const ComponentRuntime = lazyPage(() => import('../pages/ComponentRuntime'));
const ProjectSettings = lazyPage(() => import('../pages/ProjectSettings'));
const ProjectOverview = lazyPage(() => import('../pages/ProjectOverview'));
const ComponentConfigs = lazyPage(() => import('../pages/ComponentConfigs'));
const ComponentContainers = lazyPage(() => import('../pages/ComponentContainers'));
const ComponentHealthChecks = lazyPage(() => import('../pages/ComponentHealthChecks'));
const CdPipelineEditor = lazyPage(() => import('../pages/CdPipelineEditor'));
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
const TestConsole = lazyPage(() => import('../pages/TestConsole'));
const AgentChatTestRoute = lazyPage(() => import('../pages/ComponentTest').then((m) => ({ default: m.AgentChatTestRoute })));
const Environments = lazyPage(() => import('../pages/Environments'));
const CreateEnvironment = lazyPage(() => import('../pages/CreateEnvironment'));
const EditEnvironment = lazyPage(() => import('../pages/EditEnvironment'));
const RuntimeLogsOrg = lazyPage(() => import('../pages/RuntimeLogsOrg'));
const RuntimeLogsProject = lazyPage(() => import('../pages/RuntimeLogsProject'));
const RuntimeLogsIntegration = lazyPage(() => import('../pages/RuntimeLogsIntegration'));
const ComingSoon = lazyPage(() => import('../pages/ComingSoon'));

export interface AppRoute extends Omit<RouteProps, 'children'> {
  children?: AppRoute[];
}

const MATRIX: Matrix = {
  overview: { segment: '', pages: { organizations: Projects, projects: Project, components: Component } },
  build: { segment: 'build', pages: { organizations: OrgBuild, projects: ProjectBuild, components: Build } },
  deploy: { segment: 'deploy', pages: { organizations: OrgDeploy, projects: ProjectDeploy, components: Deploy } },
  // Logs come from the wso2cloud observability proxy, not the BFF.
  logs: { segment: 'logs', pages: { organizations: RuntimeLogsOrg, projects: RuntimeLogsProject, components: RuntimeLogsIntegration } },

  environments: { segment: 'environments', pages: { organizations: Environments, projects: Environments } },
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
      // WIP local login can require a password change; remove with the WIP auth.
      { path: '/change-password', element: <ForceChangePassword /> },
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
              { path: 'organizations/:orgHandler/metrics', element: <ComingSoon description="One view of throughput, latency and errors for every integration you run." /> },
              { path: 'organizations/:orgHandler/admin/cd-pipelines', element: createElement(withScope(OrgCdPipelines, ['organizations'])) },
              { path: 'organizations/:orgHandler/admin/cd-pipelines/new', element: <CdPipelineEditor /> },
              { path: 'organizations/:orgHandler/admin/cd-pipelines/:pipelineId/edit', element: <CdPipelineEditor /> },
              { path: 'organizations/:orgHandler/admin/data-planes', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgDataPlanes, ['organizations']))) },
              { path: 'organizations/:orgHandler/settings', element: createElement(withScope(OrgSettings, ['organizations'])) },
              { path: 'organizations/:orgHandler/settings/package-registries', element: createElement(RouteErrorBoundary, null, createElement(withScope(OrgPackageRegistries, ['organizations']))) },
              { path: 'organizations/:orgHandler/settings/org-details', element: createElement(withScope(OrgDetails, ['organizations'])) },
              ...generateMatrixRoutes(MATRIX),
              { path: 'organizations/:orgHandler/projects/:projectHandler/deploy', element: createElement(withScope(ProjectDeploy, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/test', element: createElement(withScope(ProjectTest, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/runtimes', element: <ComingSoon title="Coming Soon" description="Runtime management is currently under development." /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/metrics', element: <ComingSoon title="Coming Soon" description="Metrics are currently under development." /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/observe/runtimelogs', element: createElement(withScope(RuntimeLogsProject, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/observe/metrics', element: <ComingSoon description="Throughput, latency and errors for every integration in the project." /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/admin/cd-pipelines', element: createElement(withScope(ProjectCdPipelines, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/devops/environments', element: createElement(withScope(Environments, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/settings', element: createElement(withScope(ProjectSettings, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/settings/project-overview', element: createElement(withScope(ProjectOverview, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/redirect', element: <ProjectsRedirect /> },
              { path: 'organizations/:orgHandler/home', element: createElement(withScope(OrgHome, ['organizations'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/home', element: createElement(withScope(Project, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/overview', element: createElement(withScope(Component, ['components'])) },
              { path: 'organizations/:orgHandler/projects/new', element: createElement(withScope(CreateProject, ['organizations'])) },
              { path: 'organizations/:orgHandler/projects/import', element: createElement(withScope(ImportProject, ['organizations'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new', element: createElement(withScope(CreateIntegrationOptions, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/ai-builder', element: createElement(withScope(AiIntegrationBuilderView, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/import', element: createElement(withScope(ImportIntegration, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/samples', element: createElement(withScope(BrowseSamples, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new/generate-mcp', element: createElement(withScope(McpProxyFromApi, ['projects'])) },
              { path: 'organizations/:orgHandler/environments/new', element: createElement(withScope(CreateEnvironment, ['organizations'])) },
              { path: 'organizations/:orgHandler/environments/:envId/edit', element: <EditEnvironment /> },
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
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/deploy',
                element: <ComingSoon title="Coming Soon" description="Deployment management is currently under development." />,
              },
              {
                path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/metrics',
                element: <ComingSoon description="Throughput, latency and errors over time, per environment." />,
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
];

export default routes;
