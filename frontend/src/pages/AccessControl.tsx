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
import { useParams, useNavigate } from 'react-router';
import { useAccessControl } from '../contexts/AccessControlContext';
import { ALL_USER_MGT_PERMISSIONS, Permissions } from '../constants/permissions';
import { componentAccessControlUrl, componentUrl } from '../paths';
import { useProjectByHandler, useComponentByHandler } from '../api/queries';
import type { ComponentScope } from '../nav';
import { Loading } from './access-control/shared';
import { UsersTab } from './access-control/UsersTab';
import { RolesTab } from './access-control/RolesTab';
import { GroupsTab } from './access-control/GroupsTab';
import { SSOMappingsTab } from './access-control/SSOMappingsTab';

const ORG_TABS = ['users', 'roles', 'groups', 'sso-mappings'] as const;
const PROJECT_TABS = ['roles', 'groups', 'sso-mappings'] as const;

const SSO_TAB_LABEL = (
  <>
    <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
      SSO
    </Box>
    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
      SSO Mappings
    </Box>
  </>
);

export default function AccessControl(): JSX.Element {
  const { orgHandler = 'default', tab = 'users' } = useParams();
  const navigate = useNavigate();
  const { hasAnyPermission, isOrgPermissionsLoaded } = useAccessControl();

  const accessControlPerms: string[] = [...ALL_USER_MGT_PERMISSIONS];
  const canSeeAccessControl = hasAnyPermission(accessControlPerms);
  const orgTabs: readonly string[] = window.API_CONFIG.ssoEnabled ? ORG_TABS : ORG_TABS.slice(0, 3);

  useEffect(() => {
    if (!isOrgPermissionsLoaded) return;
    if (!canSeeAccessControl) {
      navigate(`/organizations/${orgHandler}`);
    }
  }, [isOrgPermissionsLoaded, canSeeAccessControl, navigate, orgHandler]);

  const tabIndex = orgTabs.indexOf(tab);
  const safeIndex = tabIndex < 0 ? 0 : tabIndex;
  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Access Control</PageTitle.Header>
      </PageTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs variant="scrollable" scrollButtons="auto" value={safeIndex} onChange={(_, v) => navigate(`/organizations/${orgHandler}/settings/access-control/${orgTabs[v] ?? 'users'}`)}>
          <Tab label="Users" />
          <Tab label="Roles" />
          <Tab label="Groups" />
          {window.API_CONFIG.ssoEnabled && <Tab label={SSO_TAB_LABEL} />}
        </Tabs>
      </Box>
      {safeIndex === 0 && <UsersTab orgHandler={orgHandler} />}
      {safeIndex === 1 && <RolesTab orgHandler={orgHandler} />}
      {safeIndex === 2 && <GroupsTab orgHandler={orgHandler} />}
      {safeIndex === 3 && window.API_CONFIG.ssoEnabled && <SSOMappingsTab orgHandler={orgHandler} />}
    </PageContent>
  );
}

export function OrgAccessControl({ org }: { org: string }): JSX.Element {
  const { tab = 'users' } = useParams();
  const navigate = useNavigate();
  const { hasAnyPermission, isOrgPermissionsLoaded } = useAccessControl();

  const accessControlPerms: string[] = [...ALL_USER_MGT_PERMISSIONS];
  const canSeeAccessControl = hasAnyPermission(accessControlPerms);
  const orgTabs: readonly string[] = window.API_CONFIG.ssoEnabled ? ORG_TABS : ORG_TABS.slice(0, 3);

  useEffect(() => {
    if (!isOrgPermissionsLoaded) return;
    if (!canSeeAccessControl) {
      navigate(`/organizations/${org}`);
    }
  }, [isOrgPermissionsLoaded, canSeeAccessControl, navigate, org]);

  const tabIndex = orgTabs.indexOf(tab);
  const safeIndex = tabIndex < 0 ? 0 : tabIndex;
  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Access Control</PageTitle.Header>
      </PageTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs variant="scrollable" scrollButtons="auto" value={safeIndex} onChange={(_, v) => navigate(`/organizations/${org}/settings/access-control/${orgTabs[v] ?? 'users'}`)}>
          <Tab label="Users" />
          <Tab label="Roles" />
          <Tab label="Groups" />
          {window.API_CONFIG.ssoEnabled && <Tab label={SSO_TAB_LABEL} />}
        </Tabs>
      </Box>
      {safeIndex === 0 && <UsersTab orgHandler={org} />}
      {safeIndex === 1 && <RolesTab orgHandler={org} />}
      {safeIndex === 2 && <GroupsTab orgHandler={org} />}
      {safeIndex === 3 && window.API_CONFIG.ssoEnabled && <SSOMappingsTab orgHandler={org} />}
    </PageContent>
  );
}

export function ProjectAccessControl({ org, project }: { org: string; project: string }): JSX.Element {
  const { tab = 'roles' } = useParams();
  const navigate = useNavigate();
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

  const projectTabs: readonly string[] = window.API_CONFIG.ssoEnabled ? PROJECT_TABS : PROJECT_TABS.slice(0, 2);
  const tabIndex = projectTabs.indexOf(tab);
  const safeIndex = tabIndex < 0 ? 0 : tabIndex;

  if (isLoading)
    return (
      <PageContent>
        <Loading />
      </PageContent>
    );

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Access Control</PageTitle.Header>
      </PageTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={safeIndex} onChange={(_, v) => navigate(`/organizations/${org}/projects/${project}/settings/access-control/${projectTabs[v] ?? 'roles'}`)}>
          <Tab label="Roles" />
          <Tab label="Groups" />
          {window.API_CONFIG.ssoEnabled && <Tab label={SSO_TAB_LABEL} />}
        </Tabs>
      </Box>
      {safeIndex === 0 && <RolesTab orgHandler={org} projectId={projectId} projectHandler={project} readOnly />}
      {safeIndex === 1 && <GroupsTab orgHandler={org} projectId={projectId} projectHandler={project} readOnly />}
      {safeIndex === 2 && window.API_CONFIG.ssoEnabled && <SSOMappingsTab orgHandler={org} projectId={projectId} />}
    </PageContent>
  );
}

export function ComponentAccessControl({ org, project, component }: ComponentScope): JSX.Element {
  const { tab = 'roles' } = useParams();
  const navigate = useNavigate();
  const { hasAnyPermission } = useAccessControl();
  const { data: projectData, isLoading: loadingProject } = useProjectByHandler(project);
  const projectId = projectData?.id ?? '';
  const { data: componentData, isLoading: loadingComponent } = useComponentByHandler(projectId, component);
  const componentId = componentData?.id;

  const accessControlPerms: string[] = [...ALL_USER_MGT_PERMISSIONS, Permissions.PROJECT_EDIT, Permissions.PROJECT_MANAGE, Permissions.INTEGRATION_EDIT, Permissions.INTEGRATION_MANAGE];
  const canSeeAccessControl = hasAnyPermission(accessControlPerms, projectId || undefined, componentId);

  useEffect(() => {
    if (!loadingProject && !loadingComponent && componentId && !canSeeAccessControl) {
      navigate(componentUrl(org, project, component));
    }
  }, [canSeeAccessControl, loadingProject, loadingComponent, componentId, navigate, org, project, component]);

  const projectTabs: readonly (typeof PROJECT_TABS)[number][] = window.API_CONFIG.ssoEnabled ? PROJECT_TABS : PROJECT_TABS.slice(0, 2);
  // Widened to string[] because `tab` is a free-form URL param; the tab strip below navigates with a typed builder.
  const tabIndex = (projectTabs as readonly string[]).indexOf(tab);
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
        <Tabs value={safeIndex} onChange={(_, v) => navigate(componentAccessControlUrl(org, project, component, projectTabs[v] ?? 'roles'))}>
          <Tab label="Roles" />
          <Tab label="Groups" />
          {window.API_CONFIG.ssoEnabled && <Tab label={SSO_TAB_LABEL} />}
        </Tabs>
      </Box>
      {safeIndex === 0 && <RolesTab orgHandler={org} projectId={projectId} projectHandler={project} componentHandler={component} readOnly />}
      {safeIndex === 1 && <GroupsTab orgHandler={org} projectId={projectId} projectHandler={project} componentHandler={component} readOnly />}
      {safeIndex === 2 && window.API_CONFIG.ssoEnabled && <SSOMappingsTab orgHandler={org} projectId={projectId} integrationId={componentId} />}
    </PageContent>
  );
}
