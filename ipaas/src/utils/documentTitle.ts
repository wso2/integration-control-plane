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
export const APP_NAME = 'WSO2 Integration';

/** Nav ids whose page name is not simply the id in sentence case. */
const TITLE_OVERRIDES: Record<string, string> = {
  'configs-secrets': 'Configs & secrets',
  'org-settings': 'Configure',
  'component-settings': 'Configure',
  'org-audit-logs': 'Audit logs',
  'org-data-planes': 'Data planes',
  'org-genai-services': 'GenAI services',
  'proj-genai-services': 'GenAI services',
  'org-third-party': 'Third-party services',
  'proj-third-party': 'Third-party services',
  'org-vector-databases': 'Vector databases',
  'org-scheduled-ingestion': 'Scheduled ingestion',
  'org-rag': 'RAG',
  'api-info': 'API info',
  'api-chat': 'API chat',
  'external-ci': 'External CI',
};

/** Scope prefixes that qualify a nav id but add nothing to a browser tab title. */
const SCOPE_PREFIXES = ['org-', 'proj-'];

function sentenceCase(id: string): string {
  const words = id.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function pageTitleFor(navId: string | undefined | null): string {
  if (!navId) return '';
  const override = TITLE_OVERRIDES[navId];
  if (override) return override;
  const prefix = SCOPE_PREFIXES.find((p) => navId.startsWith(p));
  return sentenceCase(prefix ? navId.slice(prefix.length) : navId);
}

export function formatDocumentTitle(page: string): string {
  return page ? `${page} | ${APP_NAME}` : APP_NAME;
}
