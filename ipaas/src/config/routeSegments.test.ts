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

import { describe, expect, it } from 'vitest';
import routes from './routes';

/**
 * A copy of `route_segments` in ipaas-service's growth/console_actions.yaml. ipaas-service keeps only these segments
 * in a reported route template and replaces any other with `:redacted`, so a route that uses a new segment needs it
 * added there, then here.
 */
const SERVICE_ROUTE_SEGMENTS = new Set([
  '*',
  ':componentHandler',
  ':dbServerId',
  ':knowledgeBase',
  ':orgHandler',
  ':projectHandler',
  ':runId',
  ':slug',
  ':tab',
  ':temporalId',
  'admin',
  'adoapp',
  'agent-chat',
  'ai-builder',
  'ai-services',
  'api-chat',
  'build',
  'components',
  'configs',
  'console',
  'containers',
  'cookie-policy',
  'create-project',
  'data-planes',
  'data-sources',
  'deploy',
  'deployment-tracks',
  'edit',
  'editor',
  'generate-mcp',
  'ghapp',
  'health-checks',
  'home',
  'human-tasks',
  'import',
  'import-coming-soon',
  'import-project',
  'insights',
  'knowledge-bases',
  'link-repository',
  'login',
  'logout',
  'logs',
  'metrics',
  'new',
  'observe',
  'organizations',
  'overview',
  'package-registries',
  'platform-services',
  'prebuilt-integrations',
  'projects',
  'redirect',
  'runtimelogs',
  'runtimes',
  'samples',
  'scaling',
  'settings',
  'signin',
  'signup',
  'temporal',
  'test',
  'traces',
  'user-portal',
  'voice-agent',
  'voice-agents',
  'workflows',
]);

interface RouteNode {
  path?: string;
  children?: RouteNode[];
}

function segmentsOf(nodes: RouteNode[], out = new Set<string>()): Set<string> {
  for (const node of nodes) {
    node.path
      ?.split('/')
      .filter((segment) => segment !== '')
      .forEach((segment) => out.add(segment));
    if (node.children) segmentsOf(node.children, out);
  }
  return out;
}

describe('route segments', () => {
  // Walks the route table as the router sees it, so generated routes (the build, deploy and logs pages
  // generateMatrixRoutes mounts at each level) count as well as literal paths.
  it('are all ones ipaas-service keeps in a reported page', () => {
    const missing = [...segmentsOf(routes)].filter((segment) => !SERVICE_ROUTE_SEGMENTS.has(segment)).sort();
    expect(missing, 'add these to route_segments in ipaas-service growth/console_actions.yaml, then to this list').toEqual([]);
  });

  it('include the generated pages', () => {
    const segments = segmentsOf(routes);
    for (const page of ['build', 'deploy', 'logs']) expect(segments).toContain(page);
  });
});
