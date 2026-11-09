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

import { Globe, Clock, Repeat, FileText, Bot, MCP, Cable, Workflow, ListChecks, UserCheck } from '@wso2/oxygen-ui-icons-react';
import IntegratorIcon from '../assets/icons/IntegratorIcon';
import GraphqlIcon from '../assets/icons/GraphqlIcon';
import GrpcIcon from '../assets/icons/GrpcIcon';
import KafkaIcon from '../assets/icons/KafkaIcon';
import AsbIcon from '../assets/icons/AsbIcon';
import RabbitmqIcon from '../assets/icons/RabbitmqIcon';
import NatsIcon from '../assets/icons/NatsIcon';
import S3Icon from '../assets/icons/S3Icon';
import type { ReactNode } from 'react';
import type { IntegrationTypeOption } from '../types/import';
import { TECHNOLOGY_LABELS } from './integrations';

export const INTEGRATION_TYPES: IntegrationTypeOption[] = [
  {
    id: 'automation',
    title: 'Automation',
    description: 'Run integrations on a schedule or as a recurring task',
    docLink: 'https://wso2.com/integration-platform/docs/get-started/build-automation',
    icons: [
      { icon: <Clock size={16} />, label: 'One-time task' },
      { icon: <Repeat size={16} />, label: 'Recurring task' },
    ],
  },
  {
    id: 'workflow',
    title: 'Workflow',
    description: 'Run durable, long-running processes that survive restarts and wait on people or events',
    icons: [
      { icon: <Workflow size={16} />, label: 'Durable Workflow' },
      { icon: <ListChecks size={16} />, label: 'Task' },
      { icon: <UserCheck size={16} />, label: 'Human Task' },
    ],
  },
  {
    id: 'ai-agent',
    title: 'AI Agent',
    description: 'Build AI agents that reason over your integrations and call tools and services',
    docLink: 'https://wso2.com/integration-platform/docs/get-started/build-ai-agent',
    icons: [{ icon: <Bot size={16} />, label: 'AI Agent' }],
  },
  {
    id: 'service',
    title: 'Integration as API',
    description: 'Expose your integration as a REST, GraphQL or WebSocket API',
    docLink: 'https://wso2.com/integration-platform/docs/get-started/build-integration-api',
    icons: [
      { icon: <Globe size={16} />, label: 'HTTP' },
      { icon: <GraphqlIcon size={16} />, label: 'GraphQL' },
      { icon: <GrpcIcon size={16} />, label: 'gRPC' },
      { icon: <Cable size={16} />, label: 'WebSocket' },
    ],
  },
  {
    id: 'mcp-server',
    title: 'MCP Server',
    description: 'Expose tools to AI agents and clients over the Model Context Protocol',
    docLink: 'https://wso2.com/integration-platform/docs/get-started/develop-an-mcp-server',
    icons: [{ icon: <MCP size={16} />, label: 'MCP' }],
  },
  {
    id: 'event-integration',
    title: 'Event Integration',
    description: 'React to events from sources like Kafka, Azure Service Bus, RabbitMQ or NATS',
    docLink: 'https://wso2.com/integration-platform/docs/get-started/build-event-driven-integration',
    icons: [
      { icon: <KafkaIcon size={16} />, label: 'Kafka' },
      { icon: <AsbIcon size={16} />, label: 'Azure Service Bus' },
      { icon: <RabbitmqIcon size={16} />, label: 'RabbitMQ' },
      { icon: <NatsIcon size={16} />, label: 'NATS' },
    ],
  },
  {
    id: 'file-integration',
    title: 'File Integration',
    description: 'Process files from storage systems like FTP or AWS S3 when they arrive',
    docLink: 'https://wso2.com/integration-platform/docs/get-started/build-file-driven-integration',
    icons: [
      { icon: <FileText size={16} />, label: 'File' },
      { icon: <S3Icon size={16} />, label: 'S3' },
    ],
  },
];

export const TECH_OPTIONS: { id: 'MI' | 'BI'; label: string; icon: ReactNode }[] = [
  {
    id: 'BI',
    label: TECHNOLOGY_LABELS.BI,
    icon: <IntegratorIcon width={20} height={20} />,
  },
  {
    id: 'MI',
    label: TECHNOLOGY_LABELS.MI,
    icon: <IntegratorIcon width={20} height={20} />,
  },
];

/** The public-repository URL field's example and its note, shared by the create and import flows. */
export const PUBLIC_REPO_URL_PLACEHOLDER = 'e.g. https://github.com/org/repo';
export const PUBLIC_REPO_URL_HELP = 'Only public GitHub repositories are supported.';
