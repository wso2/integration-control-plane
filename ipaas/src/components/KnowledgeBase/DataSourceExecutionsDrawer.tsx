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

import { Box, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import AutomationExecutions from '../AutomationExecutions';
import type { KnowledgeBase, KnowledgeBaseDataSource } from '../../types/knowledgeBase';

const drawerSx = {
  '& .MuiDrawer-paper': {
    width: 760,
    maxWidth: '100%',
    position: 'fixed',
    top: 64,
    height: 'calc(100% - 64px)',
    borderLeft: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    flexDirection: 'column',
  },
};

/** A data source's ingestion runs, each with its logs — the same view as the ingestion's own Overview page. */
export default function DataSourceExecutionsDrawer({ kb, dataSource, orgHandler, onClose }: { kb: KnowledgeBase; dataSource: KnowledgeBaseDataSource; orgHandler: string; onClose: () => void }): JSX.Element {
  return (
    <Drawer anchor="right" open onClose={onClose} variant="temporary" sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Box>
          <Typography variant="h5">Execution logs</Typography>
          <Typography variant="body2" color="text.secondary">
            {dataSource.displayName}
          </Typography>
        </Box>
        <IconButton size="small" aria-label="close" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </Stack>
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <AutomationExecutions
          releaseId={dataSource.releaseName}
          projectId={kb.projectName}
          componentId={dataSource.name}
          deploymentTrackId=""
          environmentId={kb.environment}
          orgHandler={orgHandler}
          projectHandler={kb.projectName}
          componentHandler={dataSource.name}
          envCritical={false}
        />
      </Box>
    </Drawer>
  );
}
