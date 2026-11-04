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

import type { ReactNode } from 'react';
import type { McpTool } from '../../../types/mcp';
import OperationTile, { type OperationTileColors } from '../_shared/bodies/OperationTile';
import McpToolDrawer from './McpToolDrawer';

/**
 * Colours for MCP tool tiles + their drawer header — the brand primary, the
 * "preferred colour" for this consumer (Integration as API uses per-HTTP-method
 * colours instead). Shared between the tile and its drawer so they match.
 */
const MCP_TOOL_COLORS: OperationTileColors = { badgeBg: 'primary.main', badgeText: 'primary.contrastText' };

/**
 * A single MCP tool row, rendered with the shared {@link OperationTile} (same
 * style as the Integration as API method tiles): a TOOL badge + the tool name,
 * with a "View details" drawer showing the tool's parameters and schema.
 */
export default function McpToolTile({ tool }: { tool: McpTool }): ReactNode {
  return <OperationTile badgeLabel="TOOL" label={tool.name} colors={MCP_TOOL_COLORS} drawerContent={<McpToolDrawer tool={tool} colors={MCP_TOOL_COLORS} />} drawerWidth={480} />;
}
