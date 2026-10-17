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

import { toEnvEndpoint } from './deployments';

// The two URLs OpenChoreo actually reports in a ReleaseBinding's status. There is no third,
// project-scoped address: Project and Organization reach the same Service, gated by NetworkPolicy.
const EXTERNAL = { host: 'gw.example', path: '/covid19-status-covid-commu-3e5', port: 443, scheme: 'https' };
const INTERNAL = { host: 'covid-commu-3e5.dp-default-development.svc.cluster.local', path: '/', port: 8090, scheme: 'http' };
const EXTERNAL_URL = 'https://gw.example/covid19-status-covid-commu-3e5';
const INTERNAL_URL = 'http://covid-commu-3e5.dp-default-development.svc.cluster.local:8090';

const bffEndpoint = (visibility: string[], urls: { external?: typeof EXTERNAL; internal?: typeof INTERNAL } = { external: EXTERNAL, internal: INTERNAL }) => ({
  name: 'covid-commu-3e5',
  type: 'HTTP',
  port: 8090,
  visibility,
  urls,
});

describe('toEnvEndpoint visibility URLs', () => {
  // The reported bug: the env card showed one row because projectUrl was never populated.
  it('gives a public+project endpoint both a public and a project URL', () => {
    const ep = toEnvEndpoint(bffEndpoint(['public', 'project']), 'r1');
    expect(ep.networkVisibilities).toEqual(['Project', 'Public']);
    expect(ep.publicUrl).toBe(EXTERNAL_URL);
    expect(ep.projectUrl).toBe(INTERNAL_URL);
    expect(ep.organizationUrl).toBe('');
  });

  it('gives a project-only endpoint a project URL and no organization URL', () => {
    const ep = toEnvEndpoint(bffEndpoint(['project'], { internal: INTERNAL }), 'r1');
    expect(ep.projectUrl).toBe(INTERNAL_URL);
    expect(ep.organizationUrl).toBe('');
    expect(ep.publicUrl).toBe('');
  });

  // Both scopes reach the same Service, so both rows carry the same URL — one row per visibility.
  it('gives organization+project the same in-cluster URL on both fields', () => {
    const ep = toEnvEndpoint(bffEndpoint(['organization', 'project'], { internal: INTERNAL }), 'r1');
    expect(ep.organizationUrl).toBe(INTERNAL_URL);
    expect(ep.projectUrl).toBe(INTERNAL_URL);
  });

  it('adds implicit project visibility even if an older response omits it', () => {
    const ep = toEnvEndpoint(bffEndpoint(['organization'], { internal: INTERNAL }), 'r1');
    expect(ep.organizationUrl).toBe(INTERNAL_URL);
    expect(ep.projectUrl).toBe(INTERNAL_URL);
  });

  // An endpoint whose visibility has not reconciled yet must not render a blank card.
  it('treats an empty visibility list as project-only', () => {
    const ep = toEnvEndpoint(bffEndpoint([], { internal: INTERNAL }), 'r1');
    expect(ep.organizationUrl).toBe('');
    expect(ep.projectUrl).toBe(INTERNAL_URL);
  });

  it('hides only the project URL when its display preference is disabled', () => {
    const ep = toEnvEndpoint({ ...bffEndpoint(['project', 'public']), displayProjectUrl: false }, 'r1');
    expect(ep.networkVisibilities).toEqual(['Public']);
    expect(ep.projectUrl).toBe('');
    expect(ep.publicUrl).toBe(EXTERNAL_URL);
  });

  it('shows Public while its default APIP deployment is enabling', () => {
    const ep = toEnvEndpoint(
      {
        ...bffEndpoint(['project']),
        visibilityStatus: { public: { status: 'ENABLING' as const }, organization: { status: 'UNAVAILABLE' as const } },
      },
      'r1',
    );
    expect(ep.networkVisibilities).toEqual(['Project', 'Public']);
  });

  it('falls back to the internal URL for invokeUrl when there is no external one', () => {
    expect(toEnvEndpoint(bffEndpoint(['project'], { internal: INTERNAL }), 'r1').invokeUrl).toBe(INTERNAL_URL);
    expect(toEnvEndpoint(bffEndpoint(['public', 'project']), 'r1').invokeUrl).toBe(EXTERNAL_URL);
  });
});
