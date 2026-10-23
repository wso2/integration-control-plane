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

import { Box, CircularProgress, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import type { EnvEndpoint } from '../../../types/component';
import { EndpointCard } from '../../EndpointCard';
import ApiSettingsDrawer from '../../Overview/integration-as-api/ApiSettingsDrawer';
import { toEndpointOptions } from '../../../utils/endpoints';

interface EndpointsDrawerProps {
  open: boolean;
  onClose: () => void;
  endpoints: EnvEndpoint[];
  isLoading?: boolean;
  envName: string;
  // Scope for the API settings drawer.
  projectId: string;
  componentId?: string;
  environmentId?: string;
}

const drawerSx = {
  '& .MuiDrawer-paper': {
    width: 440,
    position: 'fixed',
    top: 64,
    height: 'calc(100% - 64px)',
    borderLeft: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    flexDirection: 'column',
  },
} as const;

export default function EndpointsDrawer({ open, onClose, endpoints, isLoading, envName, projectId, componentId, environmentId }: EndpointsDrawerProps) {
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
      <Drawer anchor="right" open={open} onClose={handleClose} variant="temporary" sx={drawerSx}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Stack gap={0.25}>
            <Typography variant="h5">Endpoints</Typography>
            <Typography variant="caption" color="text.secondary">
              {envName}
            </Typography>
          </Stack>
          <IconButton size="small" aria-label="close" onClick={handleClose}>
            <X size={16} />
          </IconButton>
        </Stack>

        <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
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
            endpoints.map((ep, idx) => <EndpointCard key={ep.id} ep={ep} defaultExpanded={idx === 0} readOnly onSettings={handleSettings} />)
          )}
        </Box>
      </Drawer>

      <ApiSettingsDrawer
        open={manageDrawerOpen}
        onClose={() => setManageDrawerOpen(false)}
        projectName={projectId}
        componentName={componentId ?? ''}
        envName={environmentId ?? ''}
        endpoints={toEndpointOptions(endpoints)}
        activeEndpointName={selectedEndpoint?.id}
      />
    </>
  );
}
