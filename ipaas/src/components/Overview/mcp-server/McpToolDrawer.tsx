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

import { Box, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import { useMemo, type ReactNode } from 'react';
import type { McpTool } from '../../../types/mcp';
import { getMcpToolParameters } from '../../../utils/mcp';
import OperationHeader from '../_shared/bodies/OperationHeader';
import type { OperationTileColors } from '../_shared/bodies/OperationTile';

/** Drawer body for a single MCP tool: header, input parameters, and schema type. */
export default function McpToolDrawer({ tool, colors }: { tool: McpTool; colors: OperationTileColors }): ReactNode {
  const parameters = useMemo(() => getMcpToolParameters(tool), [tool]);

  return (
    <Stack gap={2.5}>
      <OperationHeader badgeLabel="TOOL" label={tool.name} colors={colors} description={tool.description} />

      {parameters.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Input parameters
          </Typography>
          <Stack gap={1}>
            {parameters.map((param) => (
              <Box key={param.name} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {param.name}
                  </Typography>
                  <Chip label={param.type} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                  {param.required && <Chip label="required" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />}
                </Stack>
                {param.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {param.description}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Schema type
        </Typography>
        <Chip label={tool.inputSchema?.type ?? 'object'} size="small" variant="outlined" />
      </Box>
    </Stack>
  );
}
