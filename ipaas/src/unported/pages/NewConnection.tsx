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

import { Button, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { isConnectionsEnabled, useCreateChoreoConnection, useCreateThirdPartyConnection, useOrgNumericId } from '../hooks/useConnections';
import { useProjectId } from '../../hooks/useProjects';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { componentConnectionsBase, friendlyConnectionError, projectConnectionsBase } from '../utils/connections';
import ResourcePicker from '../components/Connections/create/ResourcePicker';
import ConfigureConnectionForm from '../components/Connections/create/ConfigureConnectionForm';
import ComingSoon from '../../pages/ComingSoon';
import type { ChoreoConnectionRequest, ConnectionCatalogItem, ConnectionRequest, ResourceTab } from '../../types/connections';
import { hasComponent, type ComponentScope, type ProjectScope } from '../../nav';

export default function NewConnection(scope: ProjectScope | ComponentScope): JSX.Element {
  const { org, project } = scope;
  const componentHandle = hasComponent(scope) ? scope.component : undefined;
  const navigate = useAppNavigate();
  const [searchParams] = useSearchParams();
  const { projectId, isLoading } = useProjectId(project);
  const { data: componentData } = useComponentByHandler(projectId, componentHandle);
  const orgUuid = useOrgUuid() ?? '';
  const orgIdInteger = useOrgNumericId(org);
  const createChoreo = useCreateChoreoConnection();
  const createThirdParty = useCreateThirdPartyConnection();
  const [pickedService, setPickedService] = useState<ConnectionCatalogItem | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  // Keep the button in its progress state through the redirect too, so it doesn't
  // flash back to "Create" between the mutation settling and the navigation.
  const submitting = createChoreo.isPending || createThirdParty.isPending || redirecting;

  const tabParam = searchParams.get('tab');
  const initialTab: ResourceTab = tabParam === 'databases' || tabParam === 'storage' ? tabParam : 'services';

  if (!isConnectionsEnabled()) {
    return <ComingSoon title="Coming Soon" description="Creating connections is currently under development." />;
  }

  const base = componentHandle ? componentConnectionsBase(org, project, componentHandle) : projectConnectionsBase(org, project);
  const component = componentData ? { uuid: componentData.id, type: componentData.displayType } : undefined;
  const onSuccess = () => {
    setRedirecting(true);
    navigate(base);
  };
  const onError = (e: unknown) => setSubmitError(friendlyConnectionError(e instanceof Error ? e.message : ''));

  const onCreateChoreo = (request: ChoreoConnectionRequest, generateCreds: boolean) => {
    setSubmitError(null);
    createChoreo.mutate({ request, generateCreds }, { onSuccess, onError });
  };

  const onCreateThirdParty = (request: ConnectionRequest) => {
    setSubmitError(null);
    createThirdParty.mutate(request, { onSuccess, onError });
  };

  if (pickedService) {
    return (
      <PageContent>
        <Button variant="text" startIcon={<ArrowLeft size={18} />} onClick={() => setPickedService(null)} sx={{ mb: 2 }}>
          Back to resource selection
        </Button>
        {!projectId ? (
          <Stack alignItems="center" sx={{ py: 8 }}>
            <Typography>Project not found</Typography>
          </Stack>
        ) : (
          <ConfigureConnectionForm
            projectId={projectId}
            orgUuid={orgUuid}
            orgIdInteger={orgIdInteger}
            submitting={submitting}
            submitError={submitError}
            onCreateChoreo={onCreateChoreo}
            onCreateThirdParty={onCreateThirdParty}
            onCancel={() => setPickedService(null)}
            onDismissError={() => setSubmitError(null)}
            preselected={pickedService}
            component={component}
            onChangeService={() => setPickedService(null)}
          />
        )}
      </PageContent>
    );
  }

  return <ResourcePicker org={org} projectId={projectId} componentId={componentData?.id} base={base} isLoading={isLoading} initialTab={initialTab} onPick={setPickedService} />;
}
