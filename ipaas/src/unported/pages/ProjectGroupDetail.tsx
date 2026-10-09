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

import { Box, CircularProgress, PageContent, Typography } from '@wso2/oxygen-ui';
import { type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useGroups } from '../../hooks/useAuth';
import { useProjectByHandler } from '../../hooks/useProjects';
import { projectAccessControlUrl } from '../../paths';
import { GroupDetailView } from './EditGroup';

function Loading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
      <CircularProgress />
    </Box>
  );
}

export default function ProjectGroupDetail(): JSX.Element {
  const { orgHandler = 'default', projectHandler = '', groupId = '' } = useParams();
  const navigate = useAppNavigate();
  const { data: projectData, isLoading: loadingProject } = useProjectByHandler(projectHandler);
  const projectId = projectData?.id ?? '';
  const { data: groups, isLoading: loadingGroups } = useGroups(orgHandler, projectId || undefined);

  if (loadingProject || loadingGroups)
    return (
      <PageContent>
        <Loading />
      </PageContent>
    );

  const group = groups?.find((g) => g.groupId === groupId);
  if (!group)
    return (
      <PageContent>
        <Typography>Group not found</Typography>
      </PageContent>
    );

  return (
    <PageContent>
      <GroupDetailView orgHandler={orgHandler} group={group} projectId={projectId} showUsers={false} onBack={() => navigate(projectAccessControlUrl(orgHandler, projectHandler, 'groups'))} />
    </PageContent>
  );
}
