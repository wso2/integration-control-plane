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

// The current documentation site. The `get-started/` paths below are the same ones the
// Create Integration cards link to (see constants/import.tsx), so they stay in step.
const DOCS = 'https://wso2.com/integration-platform/docs/';

export interface ExploreLink {
  label: string;
  href: string;
}

export interface ExploreGroup {
  title: string;
  links: ExploreLink[];
}

/** The "Explore More" groups shown under the org's project list, mirroring Devant's. */
export const EXPLORE_GROUPS: readonly ExploreGroup[] = [
  {
    title: 'Tutorials',
    links: [
      { label: 'Build an Automation', href: `${DOCS}get-started/build-automation` },
      { label: 'Build an Integration as API', href: `${DOCS}get-started/build-integration-api` },
      { label: 'Build an AI Agent', href: `${DOCS}get-started/build-ai-agent` },
      { label: 'Build an Event-Driven Integration', href: `${DOCS}get-started/build-event-driven-integration` },
      { label: 'Build a File-Driven Integration', href: `${DOCS}get-started/build-file-driven-integration` },
      { label: 'Develop an MCP Server', href: `${DOCS}get-started/develop-an-mcp-server` },
    ],
  },
  {
    title: 'References',
    links: [
      { label: 'Promote Across Environments', href: `${DOCS}manage/cloud/environments/promotion` },
      { label: 'Manage Your Integrations with CI/CD', href: `${DOCS}deploy-operate/cicd/github-actions` },
      { label: 'Observe Your Integration', href: `${DOCS}deploy-operate/observe/observability-overview` },
    ],
  },
  {
    title: 'Support',
    links: [{ label: 'Get Support on Discord', href: 'https://discord.com/invite/wso2' }],
  },
];
