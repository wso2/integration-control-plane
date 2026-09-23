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

import { Alert, Box, ListingTable, TextField, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { CONTEXT_MCP_TOOLS } from '../../../constants/contextEngine';
import { buildMcpClientConfig, mcpEndpointUrl, resolveEngineBaseUrl } from '../../../utils/contextEngine';
import CodeViewer from '../../CodeViewer';
import ExposureToggle from './ExposureToggle';
import { endpointFieldSx, endpointRowSx } from '../styles';
import type { ContextEngineDetail } from '../../../types/contextEngine';

interface McpTabProps {
  engine: ContextEngineDetail;
}

const toolsTableSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', mb: 3 } as const;

/** Expose as MCP — the server endpoint, the tools agents get, and a client config to paste. */
export default function McpTab({ engine }: McpTabProps): JSX.Element {
  const base = resolveEngineBaseUrl(window.API_CONFIG.contextEngineApiUrl, window.location.origin);

  return (
    <Box sx={{ maxWidth: 900 }}>
      <ExposureToggle engine={engine} surface="mcp" title="MCP server" description="AI agents connect over the Model Context Protocol and call the engine's read tools with the user's identity." />

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Server endpoint
      </Typography>
      <Box sx={endpointRowSx}>
        <TextField size="small" value={mcpEndpointUrl(base)} slotProps={{ input: { readOnly: true } }} inputProps={{ 'aria-label': 'MCP endpoint' }} sx={endpointFieldSx} />
      </Box>

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Tools
      </Typography>
      <ListingTable.Container elevation={0} sx={toolsTableSx}>
        <ListingTable size="small">
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Tool</ListingTable.Cell>
              <ListingTable.Cell>What it does</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {CONTEXT_MCP_TOOLS.map((t) => (
              <ListingTable.Row key={t.name}>
                <ListingTable.Cell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {t.name}
                  </Typography>
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <Typography variant="body2" color="text.secondary">
                    {t.description}
                  </Typography>
                </ListingTable.Cell>
              </ListingTable.Row>
            ))}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>

      <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
        Every tool call and evidence read is authorized on the caller's own identity — an agent acting for a user sees exactly what that user may see, and no more.
      </Alert>

      <CodeViewer title="Client configuration" language="json" code={buildMcpClientConfig(base, engine.id, engine.name)} showCopyButton />
    </Box>
  );
}
