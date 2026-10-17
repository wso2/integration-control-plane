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

import { useEnvEndpoints } from '../../hooks/useDeployments';
import ApiSecurityDrawer from '../Overview/integration-as-api/ApiSecurityDrawer';
import { toEndpointOptions } from '../../utils/endpoints';

interface EndpointConfigDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  componentId: string;
  versionId: string;
  firstEnvReleaseId: string;
  /** Environment slug, required by the security drawer's BFF routes. */
  firstEnvId?: string;
}

/** Endpoint security settings, scoped to the first environment's endpoints. */
export default function EndpointConfigDrawer({ open, onClose, projectId, componentId, versionId, firstEnvReleaseId, firstEnvId }: EndpointConfigDrawerProps) {
  const { data: endpoints = [] } = useEnvEndpoints(componentId, versionId, firstEnvReleaseId);

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  return <ApiSecurityDrawer open={open} onClose={handleClose} projectName={projectId} componentName={componentId} envName={firstEnvId ?? ''} endpoints={toEndpointOptions(endpoints)} activeEndpointName={endpoints[0]?.id} />;
}
