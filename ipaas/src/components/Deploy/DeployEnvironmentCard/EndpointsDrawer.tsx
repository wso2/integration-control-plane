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

import { Box, CircularProgress, DrawerPanel, Stack, Typography } from '@wso2/oxygen-ui';
import { useState } from 'react';
import type { EnvEndpoint } from '../../../types/component';
import { EndpointCardList } from '../../EndpointCardList';
import ApiSettingsDrawer from '../../Overview/integration-as-api/ApiSettingsDrawer';
import { toEndpointOptions } from '../../../utils/endpoints';
import { useAiGatewayUrls } from '../../../hooks/useAiGatewayUrls';

interface EndpointsDrawerProps {
  open: boolean;
  onClose: () => void;
  endpoints: EnvEndpoint[];
  isLoading?: boolean;
  envName: string;
  // Scope for the API settings drawer.
  projectId: string;
  componentId?: string;
  environmentId: string;
  /** The deployment track whose endpoints these are; its APIs are its own. */
  versionId?: string;
  /** An MCP server, whose endpoints the AI gateway may front instead of the API Platform. */
  isMcpServer?: boolean;
}

export default function EndpointsDrawer({ open, onClose, endpoints, isLoading, envName, projectId, componentId, environmentId, versionId, isMcpServer = false }: EndpointsDrawerProps) {
  const aiGateway = useAiGatewayUrls(endpoints, { projectId, componentId: componentId ?? '', envId: environmentId, versionId: versionId ?? '' }, open && isMcpServer && !!componentId);
  const [manageDrawerOpen, setManageDrawerOpen] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<EnvEndpoint | null>(null);

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  const handleSettings = (ep: EnvEndpoint) => {
    setSelectedEndpoint(ep);
    setManageDrawerOpen(true);
  };

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} width={440}>
        <DrawerPanel.Header>
          <Stack sx={{ flex: 1, minWidth: 0 }}>
            <DrawerPanel.Title>Endpoints</DrawerPanel.Title>
            <Typography variant="caption" color="text.secondary">
              {envName}
            </Typography>
          </Stack>
          <DrawerPanel.Actions>
            <DrawerPanel.CloseButton />
          </DrawerPanel.Actions>
        </DrawerPanel.Header>

        <DrawerPanel.Body>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={32} />
            </Box>
          ) : endpoints.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No endpoints available for this deployment.
              </Typography>
            </Box>
          ) : (
            <EndpointCardList endpoints={endpoints} projectId={projectId} envId={environmentId} onSettings={handleSettings} aiGatewayUrls={aiGateway.urls} aiGatewayPending={aiGateway.pending} />
          )}
        </DrawerPanel.Body>
      </DrawerPanel>

      <ApiSettingsDrawer
        open={manageDrawerOpen}
        onClose={() => setManageDrawerOpen(false)}
        componentName={componentId ?? ''}
        envName={environmentId}
        deploymentTrackId={versionId}
        endpoints={toEndpointOptions(endpoints)}
        activeEndpointName={selectedEndpoint?.id}
      />
    </>
  );
}
