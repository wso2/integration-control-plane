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

import { Alert, Box, Button, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { Play } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useCreateContextApiKey } from '../../../../hooks/useContextEngine';
import { CONTEXT_MCP_TOOLS } from '../../../../constants/contextEngine';
import { buildMcpClientConfigs, mcpEndpointUrl } from '../../../../utils/contextEngine';
import CodeViewer from '../../../CodeViewer';
import McpPlayground from '../../../McpPlayground/McpPlayground';
import OperationHeader from '../../../Overview/_shared/bodies/OperationHeader';
import OperationTile, { type OperationTileColors } from '../../../Overview/_shared/bodies/OperationTile';
import SurfaceHeader from '../SurfaceHeader';
import { clientTabsSx, playgroundFrameSx } from '../../styles';
import { BaseUrl, FieldTable, Mono } from './ApiMockTab';
import MockTokensPanel from './MockTokensPanel';
import type { ContextEngineDetail, McpClientId } from '../../../../types/contextEngine';

/** The integration section's MCP tool colours: the brand primary. */
const TOOL_COLORS: OperationTileColors = { badgeBg: 'primary.main', badgeText: 'primary.contrastText' };
const readableSx = { maxWidth: 900 } as const;

function ToolDrawer({ name, description }: { name: string; description: string }): JSX.Element {
  return (
    <Stack gap={2.5}>
      <OperationHeader badgeLabel="TOOL" label={name} colors={TOOL_COLORS} description={description} />
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Input parameters
        </Typography>
        <FieldTable
          head={['Name', 'Type', 'Description']}
          rows={[
            [<Mono>question</Mono>, 'string, required', 'What to ask, in plain language.'],
            [<Mono>limit</Mono>, 'number, optional', 'How many passages to use.'],
          ]}
        />
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
  // The playground calls the engine with a short-lived API key, as the MCP tab does.
  const testKey = useCreateContextApiKey(engine.id);
  const mintTestKey = () => testKey.mutate({ displayName: 'MCP playground', expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
  const selected = configs.find((c) => c.id === client) ?? configs[0];
  const tools = CONTEXT_MCP_TOOLS.filter((t) => t.name !== 'get_answer' || engine.exposure.answers);

  return (
    <Box>
      <Box sx={readableSx}>
        <Alert severity="warning" sx={{ mb: 3 }}>
          Mock: a proposed layout for review. Tokens created here are not real, and the engine does not accept them.
        </Alert>

        <SurfaceHeader title="MCP server" description="Agents connect here and call the tools below." />

        <BaseUrl label="Server URL" url={endpoint} />

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Tools
        </Typography>
        <Stack gap={1}>
          {tools.map((t) => (
            <OperationTile key={t.name} badgeLabel="TOOL" label={t.name} colors={TOOL_COLORS} drawerTitle="Tool details" drawerWidth={480} drawerContent={<ToolDrawer name={t.name} description={t.description} />} />
          ))}
        </Stack>

        <MockTokensPanel engineId={engine.id} />

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
          Connect from your client
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Replace <code>&lt;token&gt;</code> with a token from Access tokens.
        </Typography>
        <Tabs value={client} onChange={(_, v) => setClient(v as McpClientId)} sx={clientTabsSx} aria-label="MCP client">
          {configs.map((c) => (
            <Tab key={c.id} label={c.label} value={c.id} />
          ))}
        </Tabs>
        <CodeViewer title={selected.path} language="json" code={selected.json} showCopyButton />

        <Box sx={{ my: 3 }}>
          <Button variant={testing ? 'outlined' : 'contained'} startIcon={<Play size={16} />} onClick={() => setTesting((t) => !t)}>
            {testing ? 'Hide MCP Playground' : 'Test in MCP Playground'}
          </Button>
        </Box>
      </Box>
      {testing && (
        <Box sx={playgroundFrameSx}>
          <McpPlayground url={endpoint} token={testKey.data?.apiKey ?? null} headerName="X-API-Key" isTokenFetching={testKey.isPending} onTokenRegenerate={mintTestKey} connectionLayout="bar" />
        </Box>
      )}
    </Box>
  );
}
