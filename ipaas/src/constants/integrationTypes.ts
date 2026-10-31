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

import type { ComponentType } from 'react';
import { AlertCircle, Clock, FileStack, Folder, Globe, MCP, Network, Sparkles, Webhook, Workflow, Zap } from '@wso2/oxygen-ui-icons-react';
import type { IntegrationType } from '../types/integration';

export interface IntegrationTypeInfo {
  displayName: string;
  Icon: ComponentType<{ size?: number }>;
}

/**
 * Central source of truth for per-integration-type presentation metadata.
 *
 * Consumed by per-page modules (e.g. `components/overview/<type>/index.ts`)
 * which spread the relevant entry into their `IntegrationModule`. Adding a
 * new `IntegrationType` requires a corresponding entry here — `Record<>`
 * makes this a compile-time check, not a runtime hope.
 *
 * If a type later needs page-specific overrides (e.g. a different label on
 * Deploy vs Overview), the page-module can spread this entry and replace
 * the field; the default stays here for everyone else.
 */
export const INTEGRATION_TYPE_INFO: Record<IntegrationType, IntegrationTypeInfo> = {
  'integration-as-api': { displayName: 'Integration as API', Icon: Globe },
  webhook: { displayName: 'Webhook', Icon: Webhook },
  automation: { displayName: 'Automation', Icon: Clock },
  'file-integration': { displayName: 'File Integration', Icon: Folder },
  'event-integration': { displayName: 'Event Integration', Icon: Zap },
  'ai-agent': { displayName: 'AI Agent', Icon: Sparkles },
  'mcp-server': { displayName: 'MCP Server', Icon: MCP },
  'mcp-proxy': { displayName: 'MCP Proxy', Icon: MCP },
  'tailscale-vpn': { displayName: 'Tailscale VPN', Icon: Network },
  'rag-ingestion': { displayName: 'RAG Ingestion', Icon: FileStack },
  workflow: { displayName: 'Workflow', Icon: Workflow },
  unsupported: { displayName: 'Unsupported', Icon: AlertCircle },
};
