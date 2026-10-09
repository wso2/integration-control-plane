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

import { Box, PageContent, PageTitle, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { useEffect, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { ALL_USER_MGT_PERMISSIONS, Permissions } from '../../constants/permissions';
import { componentAccessControlUrl } from '../../paths';
import { useProjectByHandler } from '../../hooks/useProjects';
import { useComponentByHandler } from '../../hooks/useComponents';
import type { ComponentScope } from '../../nav';
import OrgSettingsTabs from '../../components/Settings/OrgSettingsTabs';
import ProjectSettingsTabs from '../../components/Settings/ProjectSettingsTabs';
import OrgInfoHeader from '../../components/Settings/AccessControl/OrgInfoHeader';
import { Loading } from '../../components/Settings/AccessControl/shared';
import { UsersTab } from '../components/Settings/AccessControl/UsersTab';
import { RolesTab } from '../components/Settings/AccessControl/RolesTab';
import { GroupsTab } from '../components/Settings/AccessControl/GroupsTab';

const ORG_TABS = ['users', 'roles', 'groups'] as const;
const PROJECT_TABS = ['roles', 'groups'] as const;

export default function AccessControl(): JSX.Element {
  const { orgHandler = 'default', tab = 'users' } = useParams();
  const navigate = useAppNavigate();
  const { hasAnyPermission, isOrgPermissionsLoaded } = useAccessControl();

  const accessControlPerms: string[] = [...ALL_USER_MGT_PERMISSIONS];
  const canSeeAccessControl = hasAnyPermission(accessControlPerms);

  useEffect(() => {
    if (!isOrgPermissionsLoaded) return;
    if (!canSeeAccessControl) {
      navigate(`/organizations/${orgHandler}`);
    }
  }, [isOrgPermissionsLoaded, canSeeAccessControl, navigate, orgHandler]);

  // Redirects now wait for the destination's chunk, so rendering must stop here
  // rather than showing access-control content to a user who lacks permission.
  if (isOrgPermissionsLoaded && !canSeeAccessControl) return <PageContent>{null}</PageContent>;

  const tabIndex = ORG_TABS.indexOf(tab as string as (typeof ORG_TABS)[number]);
  const safeIndex = tabIndex < 0 ? 0 : tabIndex;
  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Access Control</PageTitle.Header>
      </PageTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={safeIndex} onChange={(_, v) => navigate(`/organizations/${orgHandler}/settings/access-control/${ORG_TABS[v] ?? 'users'}`)}>
          <Tab label="Users" />
          <Tab label="Roles" />
          <Tab label="Groups" />
        </Tabs>
      </Box>
      {safeIndex === 0 && <UsersTab orgHandler={orgHandler} />}
      {safeIndex === 1 && <RolesTab orgHandler={orgHandler} />}
      {safeIndex === 2 && <GroupsTab orgHandler={orgHandler} />}
    </PageContent>
  );
}

export function OrgAccessControl({ org }: { org: string }): JSX.Element {
  const { tab = 'users' } = useParams();
  const navigate = useAppNavigate();
  const { hasAnyPermission, isOrgPermissionsLoaded } = useAccessControl();

  const accessControlPerms: string[] = [...ALL_USER_MGT_PERMISSIONS];
  const canSeeAccessControl = hasAnyPermission(accessControlPerms);

  useEffect(() => {
    if (!isOrgPermissionsLoaded) return;
    if (!canSeeAccessControl) {
      navigate(`/organizations/${org}`);
    }
  }, [isOrgPermissionsLoaded, canSeeAccessControl, navigate, org]);

  // Redirects now wait for the destination's chunk, so rendering must stop here
  // rather than showing access-control content to a user who lacks permission.
  if (isOrgPermissionsLoaded && !canSeeAccessControl) return <PageContent>{null}</PageContent>;

  const tabIndex = ORG_TABS.indexOf(tab as string as (typeof ORG_TABS)[number]);
  const safeIndex = tabIndex < 0 ? 0 : tabIndex;
  return (
    <PageContent>
      <OrgSettingsTabs active="access-control" />
      <OrgInfoHeader orgHandler={org} />
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={safeIndex} onChange={(_, v) => navigate(`/organizations/${org}/settings/access-control/${ORG_TABS[v] ?? 'users'}`)}>
          <Tab label="Users" />
          <Tab label="Roles" />
          <Tab label="Groups" />
        </Tabs>
      </Box>
      {safeIndex === 0 && <UsersTab orgHandler={org} />}
      {safeIndex === 1 && <RolesTab orgHandler={org} />}
      {safeIndex === 2 && <GroupsTab orgHandler={org} />}
    </PageContent>
  );
}

export function ProjectAccessControl({ org, project }: { org: string; project: string }): JSX.Element {
  const { tab = 'roles' } = useParams();
  const navigate = useAppNavigate();
  const { hasAnyPermission } = useAccessControl();
  const { data: projectData, isLoading } = useProjectByHandler(project);
  const projectId = projectData?.id ?? '';

  const accessControlPerms: string[] = [...ALL_USER_MGT_PERMISSIONS, Permissions.PROJECT_EDIT, Permissions.PROJECT_MANAGE];
  const canSeeAccessControl = hasAnyPermission(accessControlPerms, projectId || undefined);

  useEffect(() => {
    if (!isLoading && projectId && !canSeeAccessControl) {
      navigate(`/organizations/${org}/projects/${project}`);
    }
  }, [canSeeAccessControl, isLoading, projectId, navigate, org, project]);

  // Redirects now wait for the destination's chunk, so rendering must stop here
  // rather than showing access-control content to a user who lacks permission.
  if (!isLoading && projectId && !canSeeAccessControl) return <PageContent>{null}</PageContent>;

  const tabIndex = PROJECT_TABS.indexOf(tab as string as (typeof PROJECT_TABS)[number]);
  const safeIndex = tabIndex < 0 ? 0 : tabIndex;

  if (isLoading)
    return (
      <PageContent>
        <Loading />
      </PageContent>
    );

  return (
    <PageContent>
      <ProjectSettingsTabs active="access-control" />
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={safeIndex} onChange={(_, v) => navigate(`/organizations/${org}/projects/${project}/settings/access-control/${PROJECT_TABS[v] ?? 'roles'}`)}>
          <Tab label="Roles" />
          <Tab label="Groups" />
        </Tabs>
      </Box>
      {safeIndex === 0 && <RolesTab orgHandler={org} projectId={projectId} projectHandler={project} readOnly />}
      {safeIndex === 1 && <GroupsTab orgHandler={org} projectId={projectId} projectHandler={project} readOnly />}
    </PageContent>
  );
}

export function ComponentAccessControl({ org, project, component }: ComponentScope): JSX.Element {
  const { tab = 'roles' } = useParams();
  const navigate = useAppNavigate();
  const { hasAnyPermission } = useAccessControl();
  const { data: projectData, isLoading: loadingProject } = useProjectByHandler(project);
  const projectId = projectData?.id ?? '';
  const { data: componentData, isLoading: loadingComponent } = useComponentByHandler(projectId, component);
  const componentId = componentData?.id;

  const accessControlPerms: string[] = [...ALL_USER_MGT_PERMISSIONS, Permissions.PROJECT_EDIT, Permissions.PROJECT_MANAGE, Permissions.INTEGRATION_EDIT, Permissions.INTEGRATION_MANAGE];
  const canSeeAccessControl = hasAnyPermission(accessControlPerms, projectId || undefined, componentId);

  useEffect(() => {
    if (!loadingProject && !loadingComponent && componentId && !canSeeAccessControl) {
      navigate(`/organizations/${org}/projects/${project}/integrations/${component}`);
    }
  }, [canSeeAccessControl, loadingProject, loadingComponent, componentId, navigate, org, project, component]);

  // Redirects now wait for the destination's chunk, so rendering must stop here
  // rather than showing access-control content to a user who lacks permission.
  if (!loadingProject && !loadingComponent && componentId && !canSeeAccessControl) return <PageContent>{null}</PageContent>;

  const tabIndex = PROJECT_TABS.indexOf(tab as string as (typeof PROJECT_TABS)[number]);
  const safeIndex = tabIndex < 0 ? 0 : tabIndex;

  if (loadingProject || loadingComponent)
    return (
      <PageContent>
        <Loading />
      </PageContent>
    );
  if (!projectData)
    return (
      <PageContent>
        <Typography>Project not found</Typography>
      </PageContent>
    );
  if (!componentData)
    return (
      <PageContent>
        <Typography>Component not found</Typography>
      </PageContent>
    );

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Access Control</PageTitle.Header>
      </PageTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={safeIndex} onChange={(_, v) => navigate(componentAccessControlUrl(org, project, component, PROJECT_TABS[v] ?? 'roles'))}>
          <Tab label="Roles" />
          <Tab label="Groups" />
        </Tabs>
      </Box>
      {safeIndex === 0 && <RolesTab orgHandler={org} projectId={projectId} projectHandler={project} componentHandler={component} readOnly />}
      {safeIndex === 1 && <GroupsTab orgHandler={org} projectId={projectId} projectHandler={project} componentHandler={component} readOnly />}
    </PageContent>
  );
}
