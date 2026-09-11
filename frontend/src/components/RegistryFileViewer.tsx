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

import { type JSX } from 'react';
import { Box, Button, CircularProgress, Divider, IconButton, Stack, Typography, Drawer, Tabs, Tab } from '@wso2/oxygen-ui';
import { X, Download } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { useRegistryFileContent, useRegistryResourceProperties, type GqlRegistryDirectoryItem } from '../api/queries';
import CodeViewer from './CodeViewer';

const drawerSx = {
  '& .MuiDrawer-paper': {
    width: '70%',
    maxWidth: 1200,
    minWidth: 600,
    position: 'fixed',
    top: 64,
    height: 'calc(100% - 64px)',
    borderLeft: '1px solid',
    borderColor: 'divider',
  },
};

const headerSx = {
  px: 2,
  py: 1.5,
  borderBottom: '1px solid',
  borderColor: 'divider',
};

interface RegistryFileViewerProps {
  runtimeId: string;
  filePath: string;
  item: GqlRegistryDirectoryItem;
  onClose: () => void;
}

export function RegistryFileViewer({ runtimeId, filePath, item, onClose }: RegistryFileViewerProps): JSX.Element {
  const [activeTab, setActiveTab] = useState(0);
  const { data: fileContent, isLoading: isLoadingContent } = useRegistryFileContent(runtimeId, filePath, true);
  const { data: propertiesData, isLoading: isLoadingProperties } = useRegistryResourceProperties(runtimeId, filePath, true);

  const handleDownload = () => {
    if (!fileContent) return;

    const blob = new Blob([fileContent], { type: item.mediaType || 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.name;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
  };

  const getLanguage = (mediaType?: string): 'text' | 'xml' | 'json' | 'yaml' | 'javascript' => {
    if (!mediaType) return 'text';
    if (mediaType.includes('xml')) return 'xml';
    if (mediaType.includes('json')) return 'json';
    if (mediaType.includes('javascript')) return 'javascript';
    if (mediaType.includes('yaml') || mediaType.includes('yml')) return 'yaml';
    // Languages the viewer has no highlighter for (python, java, ...) render as plain text.
    return 'text';
  };

  return (
    <Drawer anchor="right" open onClose={onClose} variant="persistent" sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={headerSx}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
            {item.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {item.mediaType}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" startIcon={<Download size={16} />} onClick={handleDownload} disabled={!fileContent}>
            Download
          </Button>
          <IconButton size="small" aria-label="close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </Stack>
      </Stack>

      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tab label="Content" />
        <Tab label={`Properties (${propertiesData?.count || 0})`} />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 0 && (
          <Box sx={{ p: 2 }}>
            {isLoadingContent ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : fileContent ? (
              <CodeViewer code={fileContent} language={getLanguage(item.mediaType)} />
            ) : (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                Unable to load file content
              </Typography>
            )}
          </Box>
        )}

        {activeTab === 1 && (
          <Box sx={{ p: 2 }}>
            {isLoadingProperties ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : propertiesData && propertiesData.properties.length > 0 ? (
              <Stack spacing={2}>
                {propertiesData.properties.map((prop, index) => (
                  <Box key={index}>
                    <Stack direction="row" spacing={2} alignItems="flex-start">
                      <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 150, color: 'text.secondary' }}>
                        {prop.name}
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {prop.value}
                      </Typography>
                    </Stack>
                    {index < propertiesData.properties.length - 1 && <Divider sx={{ mt: 2 }} />}
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No properties available
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
