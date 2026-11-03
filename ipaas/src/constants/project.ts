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

import type { WorkspaceIntegrationType } from '../types/project';

export const PROJECT_NAME_REGEX = /^[A-Za-z][a-zA-Z0-9\-_ ]*$/;
export const PROJECT_HANDLER_CHARS_REGEX = /^[a-z0-9-]+$/;
export const PROJECT_HANDLER_FULL_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export const PROJECT_NAME_MIN_LENGTH = 3;
export const PROJECT_HANDLER_MAX_LENGTH = 25;

export const HANDLER_DEBOUNCE_MS = 1000;
export const URL_DEBOUNCE_MS = 600;

export const FREE_COMPONENT_LIMIT = 5;

// Fixed segments that share the project-handle slot in /organizations/:org/projects/:project (config/routes.tsx).
export const DENIED_HANDLERS = new Set(['import', 'redirect']);

/** Handler of the project auto-provisioned for every fresh org during onboarding (see OrgHome.tsx). */
export const DEFAULT_PROJECT_HANDLER = 'default';

export const INTEGRATION_TYPE_LABELS: Record<WorkspaceIntegrationType, string> = {
  service: 'Integration as API',
  automation: 'Automation',
  'file-integration': 'File Integration',
  'event-integration': 'Event Integration',
  'ai-agent': 'AI Agent',
  'mcp-server': 'MCP Server',
};
