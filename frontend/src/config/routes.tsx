import { type RouteProps, Navigate } from 'react-router';
import { cookiePolicyUrl, loginUrl, notAuthorizedUrl, orgRoleDetailUrl, privacyPolicyUrl, projectRoleDetailUrl, componentRoleDetailUrl, projectGroupDetailUrl, componentGroupDetailUrl, loggersSegment } from '../paths';
import CreateUser from '../pages/CreateUser';
import EditUser from '../pages/EditUser';
import CreateRole from '../pages/CreateRole';
import CreateGroup from '../pages/CreateGroup';
import EditGroup from '../pages/EditGroup';
import EditEnvironment from '../pages/EditEnvironment';
import EditProject from '../pages/EditProject';
import PublicLayout from '../layouts/PublicLayout';
import PolicyLayout from '../layouts/PolicyLayout';
import Login from '../pages/Login';
import CookiePolicy from '../pages/CookiePolicy';
import PrivacyPolicy from '../pages/PrivacyPolicy';
import OIDCCallback from '../pages/OIDCCallback';
import NotAuthorized from '../pages/NotAuthorized';
import AppLayout from '../layouts/AppLayout';
import ProtectedRoute from '../auth/ProtectedRoute';
import Projects from '../pages/Projects';
import CreateProject from '../pages/CreateProject';
import CreateComponent from '../pages/CreateComponent';
import EditComponent from '../pages/EditComponent';
import Project from '../pages/Project';
import Component from '../pages/Component';
import Workflows from '../pages/Workflows';
import WorkflowTasks from '../pages/WorkflowTasks';
import TestConsole from '../pages/TestConsole';
import RuntimeLogs from '../pages/RuntimeLogs';
import Metrics from '../pages/Metrics';
import Environments from '../pages/Environments';
import CreateEnvironment from '../pages/CreateEnvironment';
import Runtime from '../pages/Runtime';
import OrgRuntimes from '../pages/OrgRuntimes';
import { OrgAccessControl, ProjectAccessControl, ComponentAccessControl } from '../pages/AccessControl';
import RoleDetail from '../pages/RoleDetail';
import ProjectRoleDetail from '../pages/ProjectRoleDetail';
import ComponentRoleDetail from '../pages/ComponentRoleDetail';
import ProjectGroupDetail from '../pages/ProjectGroupDetail';
import ComponentGroupDetail from '../pages/ComponentGroupDetail';
import Profile from '../pages/Profile';
import ForceChangePassword from '../pages/ForceChangePassword';
import ManageLoggers from '../pages/ManageLoggers';
import { ScopeResolver, generateMatrixRoutes, withScope, type Matrix } from '../nav';
import { createElement } from 'react';
import ErrorPage from '../pages/Error';

export interface AppRoute extends Omit<RouteProps, 'children'> {
  children?: AppRoute[];
}

const MATRIX: Matrix = {
  overview: { segment: '', pages: { organizations: Projects, projects: Project, components: Component } },
  workflows: { segment: 'workflows', pages: { projects: Workflows, components: Workflows } },
  tasks: { segment: 'workflow-tasks', pages: { projects: WorkflowTasks, components: WorkflowTasks } },
  test: { segment: 'test-console', pages: { components: TestConsole } },
  logs: { segment: 'logs', pages: { projects: RuntimeLogs, components: RuntimeLogs } },
  loggers: { segment: loggersSegment, pages: { components: ManageLoggers } },
  metrics: { segment: 'metrics', pages: { projects: Metrics, components: Metrics } },
  runtimes: { segment: 'runtimes', pages: { organizations: OrgRuntimes, projects: Runtime, components: Runtime } },
  environments: { segment: 'environments', pages: { organizations: Environments, projects: Environments } },
  'access-control': { segment: 'settings/access-control/:tab', pages: { organizations: OrgAccessControl, projects: ProjectAccessControl, components: ComponentAccessControl } },
};

const routes: AppRoute[] = [
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/error', element: <ErrorPage /> },
  { path: '*', element: <Navigate to="/error?type=404" replace /> },
  {
    element: <PublicLayout />,
    children: [{ path: loginUrl(), element: <Login /> }],
  },
  {
    element: <PolicyLayout />,
    children: [
      { path: cookiePolicyUrl(), element: <CookiePolicy /> },
      { path: privacyPolicyUrl(), element: <PrivacyPolicy /> },
    ],
  },
  { path: '/sso/callback', element: <OIDCCallback /> },
  { path: notAuthorizedUrl(), element: <NotAuthorized /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/change-password', element: <ForceChangePassword /> },
      {
        element: <ScopeResolver />,
        children: [
          {
            element: <AppLayout />,
            children: [
              ...generateMatrixRoutes(MATRIX),
              { path: 'organizations/:orgHandler/projects/new', element: createElement(withScope(CreateProject, ['organizations'])) },
              { path: 'organizations/:orgHandler/projects/:projectId/edit', element: <EditProject /> },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/new', element: createElement(withScope(CreateComponent, ['projects'])) },
              { path: 'organizations/:orgHandler/projects/:projectHandler/components/:componentHandler/edit', element: createElement(withScope(EditComponent, ['projects', 'components'])) },
              { path: 'organizations/:orgHandler/environments/new', element: createElement(withScope(CreateEnvironment, ['organizations'])) },
              { path: 'organizations/:orgHandler/environments/:envId/edit', element: <EditEnvironment /> },
              { path: 'organizations/:orgHandler/settings/access-control/users/new', element: <CreateUser /> },
              { path: 'organizations/:orgHandler/settings/access-control/users/:userId/edit', element: <EditUser /> },
              { path: 'organizations/:orgHandler/settings/access-control/roles/new', element: <CreateRole /> },
              { path: 'organizations/:orgHandler/settings/access-control/groups/new', element: <CreateGroup /> },
              { path: 'organizations/:orgHandler/settings/access-control/groups/:groupId/edit', element: <EditGroup /> },
              { path: orgRoleDetailUrl(':orgHandler', ':roleId'), element: <RoleDetail /> },
              { path: projectRoleDetailUrl(':orgHandler', ':projectHandler', ':roleId'), element: <ProjectRoleDetail /> },
              { path: componentRoleDetailUrl(':orgHandler', ':projectHandler', ':componentHandler', ':roleId'), element: <ComponentRoleDetail /> },
              { path: projectGroupDetailUrl(':orgHandler', ':projectHandler', ':groupId'), element: <ProjectGroupDetail /> },
              { path: componentGroupDetailUrl(':orgHandler', ':projectHandler', ':componentHandler', ':groupId'), element: <ComponentGroupDetail /> },
              { path: '/profile', element: <Profile /> },
            ],
          },
        ],
      },
    ],
  },
];

export default routes;
