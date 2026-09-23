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

import { Bot, Clock, Folder, Globe, HardDrive, Layers, Radio, Repeat, Server, Sparkles, SquareCheck, UserCheck, Workflow, Wrench, Zap } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import type { Technology } from './technologies';

export type IntegrationType = 'unspecified' | 'service' | 'automation' | 'file-integration' | 'event-integration' | 'ai-agent' | 'mcp-server' | 'workflow';

export interface IntegrationTypeOption {
  id: Exclude<IntegrationType, 'unspecified'>;
  title: string;
  description: string;
  icons: { icon: ReactNode; label: string }[];
  /** Technologies offering this type. Omitted means every technology. */
  technologies?: Technology[];
}

/**
 * Optional classification for an integration. Specific types match the devant
 * integration-create flow. No selection is stored as unspecified.
 */
export const INTEGRATION_TYPES: IntegrationTypeOption[] = [
  {
    id: 'service',
    title: 'Integration as API',
    description: 'Expose your integration as a REST, GraphQL or WebSocket API',
    icons: [
      { icon: <Globe size={16} />, label: 'REST' },
      { icon: <Layers size={16} />, label: 'GraphQL' },
    ],
  },
  {
    id: 'automation',
    title: 'Automation',
    description: 'Run integrations on a schedule or as a recurring task',
    icons: [
      { icon: <Clock size={16} />, label: 'Scheduled' },
      { icon: <Repeat size={16} />, label: 'Recurring' },
    ],
  },
  {
    id: 'workflow',
    title: 'Workflow',
    description: 'Orchestrate long-running processes with durable state and human tasks',
    // Icons match how the execution graph and timeline draw these node kinds (iconByType in
    // components/workflow/graphVisuals.ts), so a workflow reads the same here as it does once running.
    icons: [
      { icon: <Workflow size={16} />, label: 'Durable' },
      { icon: <SquareCheck size={16} />, label: 'Activities' },
      { icon: <UserCheck size={16} />, label: 'Human tasks' },
    ],
    // The workflow engine and its management API are Ballerina-only (see [ballerina.workflow] in the
    // runtime config), so this type is not offered for MI.
    technologies: ['BI'],
  },
  {
    id: 'file-integration',
    title: 'File Integration',
    description: 'Process files from storage systems like FTP or AWS S3 when they arrive',
    icons: [
      { icon: <Folder size={16} />, label: 'Files' },
      { icon: <HardDrive size={16} />, label: 'Storage' },
    ],
  },
  {
    id: 'event-integration',
    title: 'Event Integration',
    description: 'React to events from sources like Kafka, Azure Service Bus, RabbitMQ or NATS',
    icons: [
      { icon: <Zap size={16} />, label: 'Events' },
      { icon: <Radio size={16} />, label: 'Streaming' },
    ],
  },
  {
    id: 'ai-agent',
    title: 'AI Agent',
    description: 'Build AI agents that reason over your integrations and call tools and services',
    icons: [
      { icon: <Bot size={16} />, label: 'Agent' },
      { icon: <Sparkles size={16} />, label: 'AI' },
    ],
  },
  {
    id: 'mcp-server',
    title: 'MCP Server',
    description: 'Expose tools to AI agents and clients over the Model Context Protocol',
    icons: [
      // devant uses a dedicated MCP glyph from @wso2/oxygen-ui-icons-react 0.9.x;
      // ICP is on 0.8.0, which does not export it yet.
      { icon: <Server size={16} />, label: 'MCP' },
      { icon: <Wrench size={16} />, label: 'Tools' },
    ],
  },
];

/**
 * Encodes the chosen technology and integration type into the `displayType` the
 * backend persists, matching devant's mapping so both products store the same
 * value for the same choice.
 *
 * File Integration, AI Agent and MCP Server share a generic service displayType —
 * they are told apart by {@link resolveComponentSubType}.
 */
export function resolveDisplayType(technology: Technology, integrationType: IntegrationType): string {
  if (integrationType === 'unspecified') return 'unspecified';
  if (technology === 'BI') {
    if (integrationType === 'automation') return 'scheduledTask';
    if (integrationType === 'event-integration') return 'ballerinaEventHandler';
    if (integrationType === 'workflow') return 'ballerinaWorkflow';
    return 'ballerinaService';
  }
  if (integrationType === 'automation') return 'miCronjob';
  if (integrationType === 'event-integration') return 'miEventHandler';
  return 'miApiService';
}

/**
 * The subtype that discriminates types sharing a generic service `displayType`.
 * Returns undefined for the types that carry their identity in `displayType`
 * alone (Integration as API, Automation, Event Integration).
 */
export function resolveComponentSubType(technology: Technology, integrationType: IntegrationType): string | undefined {
  if (integrationType === 'file-integration') return technology === 'BI' ? 'ballerinaFileIntegration' : 'miFileIntegration';
  if (integrationType === 'ai-agent') return 'aiAgent';
  if (integrationType === 'mcp-server') return 'MCP';
  return undefined;
}

/**
 * Reverse of {@link resolveDisplayType} / {@link resolveComponentSubType}, for
 * read-only display. `componentSubType` is checked first, since the types that
 * carry one share their `displayType` with Integration as API.
 *
 * Components created before integration types existed carry the legacy `service`
 * displayType and read back as Integration as API.
 */
export function integrationTypeFromStored(displayType: string, componentSubType?: string | null): IntegrationType {
  switch (componentSubType) {
    case 'ballerinaFileIntegration':
    case 'miFileIntegration':
      return 'file-integration';
    case 'aiAgent':
      return 'ai-agent';
    case 'MCP':
      return 'mcp-server';
  }
  switch (displayType) {
    case 'unspecified':
      return 'unspecified';
    case 'scheduledTask':
    case 'miCronjob':
      return 'automation';
    case 'ballerinaEventHandler':
    case 'miEventHandler':
      return 'event-integration';
    case 'ballerinaWorkflow':
      return 'workflow';
    default:
      return 'service';
  }
}

export function integrationTypeLabel(displayType: string, componentSubType?: string | null): string {
  switch (componentSubType) {
    case 'ballerinaFileIntegration':
    case 'miFileIntegration':
      return 'File Integration';
    case 'aiAgent':
      return 'AI Agent';
    case 'MCP':
      return 'MCP Server';
  }
  switch (displayType) {
    case 'unspecified':
      return '';
    case 'ballerinaWorkflow':
      return 'Workflow';
    case 'scheduledTask':
    case 'miCronjob':
      return 'Automation';
    case 'ballerinaEventHandler':
    case 'miEventHandler':
      return 'Event Integration';
    default:
      return 'Integration as API';
  }
}

/** The integration types on offer for a technology (see {@link IntegrationTypeOption.technologies}). */
export function integrationTypesFor(technology: Technology): IntegrationTypeOption[] {
  return INTEGRATION_TYPES.filter((t) => !t.technologies || t.technologies.includes(technology));
}

/**
 * Whether an integration is a workflow one, from the fields the backend persists. Used to decide
 * whether the integration-level Workflows view applies — a project-level one always does, since a
 * project's workflow data is namespace-wide rather than tied to any single integration.
 */
export function isWorkflowIntegration(displayType?: string | null): boolean {
  return displayType === 'ballerinaWorkflow';
}
