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

import { Alert, Button, PageContent, PageTitle } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import EditProjectSkeleton from '../components/EditProjectSkeleton';
import Authorized from '../components/Authorized';
import LinkRepositoryForm from '../components/ProjectCreate/LinkRepositoryForm';
import { Scopes } from '../constants/permissions';
import PageNotFound from './PageNotFound';
import { useProjectId } from '../hooks/useProjects';
import { resourceUrl, type ProjectScope } from '../nav';
import { orgProjectsUrl } from '../paths';

export default function LinkRepository(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const { project, isLoading, isError, refetch } = useProjectId(scope.project);
  const projectHomeUrl = resourceUrl(scope, 'overview');

  if (isLoading) return <EditProjectSkeleton />;
  if (isError)
    return (
      <PageContent fullWidth sx={{ pt: 5 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Could not load the project.
        </Alert>
      </PageContent>
    );
  if (!project) return <PageNotFound title="Project not found" actionTo={orgProjectsUrl(scope.org)} actionLabel="Back to projects" />;

  return (
    <Authorized
      permissions={Scopes.PROJECT_UPDATE}
      fallback={<PageNotFound title="You can't link a repository to this project" description="Linking a repository needs permission to edit the project." actionTo={projectHomeUrl} actionLabel="Back to project" />}>
      <PageContent fullWidth sx={{ pt: 5 }}>
        <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(projectHomeUrl)} sx={{ mb: 2 }}>
          Back to project
        </Button>

        <PageTitle>
          <PageTitle.Header>Link a repository</PageTitle.Header>
        </PageTitle>

        <LinkRepositoryForm project={project} orgHandler={scope.org} onDone={() => navigate(projectHomeUrl)} />
      </PageContent>
    </Authorized>
  );
}
