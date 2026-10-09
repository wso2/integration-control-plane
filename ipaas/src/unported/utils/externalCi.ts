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

/**
 * Pure helpers for the External CI page: the per-provider webhook snippets and
 * token-table formatting. Snippet templates mirror Devant's `getPipelineCodeSnippet`.
 */

export type ExternalCiProvider = 'curl' | 'github' | 'gcb' | 'azure';

/** Webhook-snippet tabs, in display order, with the CodeViewer language for each. */
export const EXTERNAL_CI_PROVIDERS: { key: ExternalCiProvider; label: string; language: 'text' | 'yaml' }[] = [
  { key: 'curl', label: 'cURL', language: 'text' },
  { key: 'github', label: 'Github Actions', language: 'yaml' },
  { key: 'gcb', label: 'Google Cloud Build', language: 'yaml' },
  { key: 'azure', label: 'Azure DevOps Pipelines', language: 'yaml' },
];

/** The most tokens allowed per component (matches Devant). */
export const MAX_EXTERNAL_CI_TOKENS = 3;

/** Documentation link for the "How does this work?" anchor. */
export const EXTERNAL_CI_DOC_URL = 'https://wso2.com/choreo/docs/devops-and-ci-cd/auto-deploy-using-an-external-ci-pipeline/';

interface SnippetArgs {
  componentId: string;
  versionId: string;
  /** Full deploy endpoint, e.g. `https://apis…/devops/1.0.0/external-ci/deploy`. */
  endpoint: string;
}

/** The webhook code snippet for a provider (Devant's `getPipelineCodeSnippet`, trimmed). */
export function getPipelineSnippet(provider: ExternalCiProvider, { componentId, versionId, endpoint }: SnippetArgs): string {
  switch (provider) {
    case 'curl':
      return `curl --location --request POST '${endpoint}' \\
      --header 'Content-Type: application/json' \\
      --data-raw '{
        "component_id": "${componentId}",
        "version_id": "${versionId}",
        "image": "<INSERT_IMAGE>",
        "token": "<INSERT_TOKEN>"
      }'`;
    case 'github':
      return `# This assumes that a token has been added as a GitHub Secret.
deploy:
  runs-on: ubuntu-latest
  steps:
  # Must run after the image is built and pushed to the container registry
  - name: Deploy to Choreo
    run: |
      curl --location --request POST '${endpoint}' \\
      --header 'Content-Type: application/json' \\
      --data-raw '{
        "component_id": "${componentId}",
        "version_id": "${versionId}",
        "image": "<INSERT_IMAGE>",
        "token": "\${{ secrets.CHOREO_TOKEN }}"
      }'`;
    case 'gcb':
      return `steps:
- deploy-to-choreo:
    call: http.request
    args:
      url: "${endpoint}"
      method: "POST"
      headers:
        "Content-Type": "application/json; charset=utf-8"
      body:
        component_id: "${componentId}"
        version_id: "${versionId}"
        image: "<INSERT_IMAGE>"
        token: "<INSERT_TOKEN>"`;
    case 'azure':
      return `- stage: Deploy
  jobs:
  - job: Deploy
    pool:
      vmImage: ubuntu-latest
    steps:
    - task: Bash@3
      displayName: Deploy to Choreo
      inputs:
        targetType: 'inline'
        script: |
          curl --location --request POST '${endpoint}' \\
          --header 'Content-Type: application/json' \\
          --data-raw '{
            "component_id": "${componentId}",
            "version_id": "${versionId}",
            "image": "<INSERT_IMAGE>",
            "token": "<INSERT_TOKEN>"
          }'`;
    default:
      return '';
  }
}

/** True for the API's "never used" sentinel timestamp (`0001-01-01…`). */
export function isNeverUsed(lastUsed: string | undefined): boolean {
  return !lastUsed || lastUsed.startsWith('0001-01-01') || Number.isNaN(Date.parse(lastUsed));
}

/** Human label for a token's `last_used`, or "Never" for the sentinel. */
export function tokenLastUsedLabel(lastUsed: string | undefined): string {
  if (isNeverUsed(lastUsed)) return 'Never';
  return new Date(lastUsed as string).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
