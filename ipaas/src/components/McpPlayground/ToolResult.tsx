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

import { Box, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Copy } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { copyableToolResult, repeatsStructuredContent } from '../../utils/mcp';
import type { McpToolContent, McpToolResult } from '../../types/mcp';

const codeBlockSx = {
  bgcolor: 'action.hover',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  p: 1.5,
  m: 0,
  fontFamily: 'monospace',
  fontSize: 12.5,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflow: 'auto',
} as const;

/** Render one content block — pretty-print JSON text, otherwise show it verbatim. */
function ContentBlock({ block }: { block: McpToolContent }): JSX.Element {
  if (block.type === 'text' && typeof block.text === 'string') {
    let display = block.text;
    try {
      display = JSON.stringify(JSON.parse(block.text), null, 2);
    } catch {
      /* not JSON — show as-is */
    }
    return (
      <Box component="pre" sx={codeBlockSx}>
        {display}
      </Box>
    );
  }
  return (
    <Box component="pre" sx={codeBlockSx}>
      {JSON.stringify(block, null, 2)}
    </Box>
  );
}

/**
 * The result of a tool invocation: a "Tool Result: Success/Error" label, the structured result
 * when the tool returns one, and every content block that adds something to it. Servers repeat
 * the structured result as a JSON text block for older clients; that copy is not shown twice.
 */
export default function ToolResult({ result }: { result: McpToolResult }): JSX.Element {
  const structured = result.structuredContent;
  const blocks = result.content.filter((block) => !repeatsStructuredContent(block, structured));
  const copyAll = () => void navigator.clipboard?.writeText(JSON.stringify(copyableToolResult(structured, blocks), null, 2)).catch(() => undefined);
  return (
    <Stack gap={1}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Tool Result:{' '}
          <Box component="span" sx={{ color: result.isError ? 'error.main' : 'success.main' }}>
            {result.isError ? 'Error' : 'Success'}
          </Box>
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Copy result">
          <IconButton size="small" aria-label="Copy result" onClick={copyAll}>
            <Copy size={14} />
          </IconButton>
        </Tooltip>
      </Stack>
      {structured !== undefined && (
        <Box component="pre" sx={codeBlockSx}>
          {JSON.stringify(structured, null, 2)}
        </Box>
      )}
      {structured === undefined && blocks.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          The tool returned no content.
        </Typography>
      ) : (
        blocks.map((block, i) => <ContentBlock key={i} block={block} />)
      )}
    </Stack>
  );
}
