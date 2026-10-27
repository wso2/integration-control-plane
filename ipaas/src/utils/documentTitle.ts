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

/** Matches the static title in index.html, which public routes keep. */
export const APP_NAME = 'WSO2 Integration Platform';

/** Nav ids whose page name is not simply the id title-cased. */
const TITLE_OVERRIDES: Record<string, string> = {
  'configs-secrets': 'Configs & Secrets',
  'component-settings': 'Settings',
  'org-audit-logs': 'Audit Logs',
  'org-cd-pipelines': 'Pipelines',
  'proj-cd-pipelines': 'Pipelines',
  'org-data-planes': 'Data Planes',
  'org-genai-services': 'GenAI Services',
  'proj-genai-services': 'GenAI Services',
  'org-third-party': 'Third Party Services',
  'proj-third-party': 'Third Party Services',
  'org-vector-databases': 'Vector Databases',
  'org-scheduled-ingestion': 'Scheduled Ingestion',
  'org-rag': 'RAG',
  'org-context-engines': 'Context Engines',
  'api-info': 'API Info',
  'api-chat': 'API Chat',
  'external-ci': 'External CI',
};

/** Scope prefixes that qualify a nav id but add nothing to a browser tab title. */
const SCOPE_PREFIXES = ['org-', 'proj-'];

function titleCase(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function pageTitleFor(navId: string | undefined | null): string {
  if (!navId) return '';
  const override = TITLE_OVERRIDES[navId];
  if (override) return override;
  const prefix = SCOPE_PREFIXES.find((p) => navId.startsWith(p));
  return titleCase(prefix ? navId.slice(prefix.length) : navId);
}

export function formatDocumentTitle(page: string): string {
  return page ? `${page} | ${APP_NAME}` : APP_NAME;
}
