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

import { Bot, Boxes, CalendarClock, Database, FileText, Globe, MCP, Network, Puzzle, ShieldCheck, Webhook, Workflow, Zap } from '@wso2/oxygen-ui-icons-react';
import type { ComponentType } from 'react';
import type { IntegrationType } from '../types/integration';

/** Icons take a pixel `size` and paint with `currentColor`, so the caller owns the theming. */
export type IntegrationIconComponent = ComponentType<{ size?: number }>;

/**
 * One icon per integration type. Exhaustive by type, so a new integration type fails to compile until it has one.
 */
export const INTEGRATION_TYPE_ICONS: Record<IntegrationType, IntegrationIconComponent> = {
  'integration-as-api': Globe,
  webhook: Webhook,
  automation: CalendarClock,
  'file-integration': FileText,
  'event-integration': Zap,
  'ai-agent': Bot,
  'mcp-server': MCP,
  'mcp-proxy': Network,
  'tailscale-vpn': ShieldCheck,
  'rag-ingestion': Database,
  workflow: Workflow,
  unsupported: Puzzle,
};

/** Components owned by another platform — deliberately unlike any integration icon. */
export const EXTERNAL_COMPONENT_ICON: IntegrationIconComponent = Boxes;

export function integrationTypeIcon(type: IntegrationType | null | undefined): IntegrationIconComponent {
  return (type && INTEGRATION_TYPE_ICONS[type]) || INTEGRATION_TYPE_ICONS.unsupported;
}
