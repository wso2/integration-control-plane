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

import { INTEGRATION_TYPE_INFO } from '../../../constants/integrationTypes';
import type { IntegrationModule } from '../../../types/integration';
import HeaderStatus from './HeaderStatus';
import EnvCardActions from './EnvCardActions';
import EnvCardBody from './EnvCardBody';

/**
 * MCP Server integration module — shared by BOTH MCP flavors:
 *   - **MCP Server** (`componentSubType: MCP` + a service displayType): built
 *     from source, so the page shows a Build card.
 *   - **MCP Proxy** (`componentSubType: MCP` + `proxy`/`gitProxy` displayType):
 *     converted from an existing HTTP API — no source repo, so `Component.tsx`
 *     hides the Build card.
 * Both resolve here via the registry (`mcp-server` and `mcp-proxy` → this
 * module), rendering the same Overview with that single difference.
 *
 * Env-card body is the deployed server's **tools list** (`useMcpTools` over the
 * MCP SDK); the interactive playground (Test tab) is deferred.
 */
const mcpServerModule: IntegrationModule = {
  ...INTEGRATION_TYPE_INFO['mcp-server'],
  HeaderStatus,
  EnvCardActions,
  EnvCardBody,
  // MCP has no in-editor source-editing surface — hide Open in Cloud / VS Code
  // (devant excludes it for `componentSubType === 'MCP'`).
  hideOpenInEditor: true,
};

export default mcpServerModule;
