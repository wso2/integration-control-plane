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

import { PageContent } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useCreateGenaiService } from '../hooks/useGenaiServices';
import { useProjectId } from '../../hooks/useProjects';
import { genaiServicesBase } from '../utils/genaiServices';
import GenAIServiceWizard from '../components/GenAIServices/GenAIServiceWizard';
import { HttpError } from '../../types/http';
import { hasProject, type OrgScope, type ProjectScope } from '../../nav';
import type { CreateGenAiServiceArgs } from '../../types/genaiServices';

export default function RegisterGenAIService(scope: OrgScope | ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const projectHandle = hasProject(scope) ? scope.project : undefined;
  const { projectId, isLoading: resolvingProject } = useProjectId(projectHandle ?? '');
  const base = genaiServicesBase(scope);
  const create = useCreateGenaiService(projectHandle ? projectId || undefined : undefined);
  const [error, setError] = useState<string | null>(null);

  // In project scope, never submit until the project id has resolved, or the service would be created without project context.
  const projectNotReady = !!projectHandle && (resolvingProject || !projectId);

  const onSubmit = (args: CreateGenAiServiceArgs) => {
    if (projectNotReady) return;
    setError(null);
    create.mutate(args, {
      onSuccess: () => navigate(base),
      onError: (e) => setError(e instanceof HttpError && e.status === 409 ? 'A GenAI service with this name and version already exists.' : "Couldn't register the GenAI service. Please try again."),
    });
  };

  return (
    <PageContent>
      <GenAIServiceWizard orgHandle={scope.org} submitting={create.isPending || projectNotReady} submitError={error} onSubmit={onSubmit} onCancel={() => navigate(base)} />
    </PageContent>
  );
}
