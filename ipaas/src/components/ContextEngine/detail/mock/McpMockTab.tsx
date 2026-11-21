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

import { Alert, Box, Button, Stack, Tab, Tabs, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Play } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { CONTEXT_MCP_TOOLS } from '../../../../constants/contextEngine';
import { buildMcpClientConfigs, mcpEndpointUrl } from '../../../../utils/contextEngine';
import CodeViewer from '../../../CodeViewer';
import McpPlayground from '../../../McpPlayground/McpPlayground';
import OperationHeader from '../../../Overview/_shared/bodies/OperationHeader';
import OperationTile, { type OperationTileColors } from '../../../Overview/_shared/bodies/OperationTile';
import AccessOffAlert from '../AccessOffAlert';
import AccessSwitch from '../AccessSwitch';
import SurfaceHeader from '../SurfaceHeader';
import { clientTabsSx, playgroundFrameSx } from '../../styles';
import { BaseUrl, QueryFields } from './ApiMockTab';
import MockTokensPanel from './MockTokensPanel';
import { MCP_TOOL_COLORS } from '../../../../utils/httpMethods';
import type { ContextEngineDetail, ContextEngineExposure, McpClientId } from '../../../../types/contextEngine';

/** The integration section's MCP tool colours: the brand primary. */
const TOOL_COLORS: OperationTileColors = MCP_TOOL_COLORS;
const readableSx = { maxWidth: 900 } as const;

function ToolDrawer({ name, description, exposure }: { name: string; description: string; exposure: ContextEngineExposure }): JSX.Element {
  return (
    <Stack gap={2.5}>
      <OperationHeader badgeLabel="TOOL" label={name} colors={TOOL_COLORS} description={description} />
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Input parameters
        </Typography>
        <QueryFields name="Name" exposure={exposure} />
      </Box>
    </Stack>
  );
}

/**
 * MOCK. The proposed MCP tab: the server address, the tools as the integration section's tool
 * tiles, the same access tokens as the API tab, then a client config and the test playground.
 */
export default function McpMockTab({ engine }: { engine: ContextEngineDetail }): JSX.Element {
  const base = engine.publicApiUrl ?? '';
  const endpoint = mcpEndpointUrl(base);
  const configs = useMemo(() => buildMcpClientConfigs(base, engine.name), [base, engine.name]);
  const [client, setClient] = useState<McpClientId>('claude-desktop');
  const [testing, setTesting] = useState(false);
  // The playground connects with one of the engine's access tokens: the one created above in this visit, or one pasted in.
  const [playgroundToken, setPlaygroundToken] = useState('');
  const selected = configs.find((c) => c.id === client) ?? configs[0];
  const mcpOff = engine.access?.mcp === false;
  const testBlockedReason = mcpOff ? 'Turn on MCP access to test the server here.' : '';

  if (!engine.publicApiUrl) {
    return (
      <Box sx={{ maxWidth: 900 }}>
        <SurfaceHeader title="MCP server" description="Agents connect here and call the tools below." />
        <Alert severity="info" variant="outlined">
          The public endpoint isn&apos;t ready yet. It appears here once the engine&apos;s gateway route is set up.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={readableSx}>
        <SurfaceHeader title="MCP server" description="Agents connect here and call the tools below." action={engine.access && <AccessSwitch engineId={engine.id} access={engine.access} surface="mcp" />} />
        {mcpOff && <AccessOffAlert surface="mcp" />}

        <BaseUrl label="Server URL" url={endpoint} />

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Tools
        </Typography>
        <Stack gap={1}>
          {CONTEXT_MCP_TOOLS.map((t) => (
            <OperationTile key={t.name} badgeLabel="TOOL" label={t.name} colors={TOOL_COLORS} drawerTitle="Tool details" drawerWidth={480} drawerContent={<ToolDrawer name={t.name} description={t.description} exposure={engine.exposure} />} />
          ))}
        </Stack>

        <MockTokensPanel engineId={engine.id} onIssued={setPlaygroundToken} />

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
          Connect from your client
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Replace <code>&lt;api key&gt;</code> with one of the access tokens above.
        </Typography>
        <Tabs value={client} onChange={(_, v) => setClient(v as McpClientId)} sx={clientTabsSx} aria-label="MCP client">
          {configs.map((c) => (
            <Tab key={c.id} label={c.label} value={c.id} />
          ))}
        </Tabs>
        <CodeViewer title={selected.path} language="json" code={selected.json} showCopyButton />

        <Box sx={{ my: 3 }}>
          <Tooltip title={testBlockedReason}>
            <span>
              <Button variant={testing ? 'outlined' : 'contained'} startIcon={<Play size={16} />} disabled={!!testBlockedReason} onClick={() => setTesting((t) => !t)}>
                {testing ? 'Hide MCP Playground' : 'Test in MCP Playground'}
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>
      {testing && !testBlockedReason && (
        <Box sx={playgroundFrameSx}>
          <McpPlayground url={endpoint} token={playgroundToken || null} headerName="X-API-Key" onTokenChange={setPlaygroundToken} tokenPlaceholder="Paste an access token" connectionLayout="bar" />
        </Box>
      )}
    </Box>
  );
}
