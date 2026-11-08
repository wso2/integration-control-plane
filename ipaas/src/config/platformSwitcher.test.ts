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
import { buildPlatformSwitcher } from './platformSwitcher';

const ids = (config: Parameters<typeof buildPlatformSwitcher>[0]) => buildPlatformSwitcher(config, '/').map(({ id, url }) => [id, url]);

describe('buildPlatformSwitcher', () => {
  it('shows only this console when nothing else is configured', () => {
    expect(ids({})).toEqual([['integration-platform', '/']]);
  });

  it('lists configured platforms in display order', () => {
    const config = {
      platformUrls: { 'identity-platform': 'https://id.example', 'agent-manager': '/agent-platform', 'api-platform': 'https://api.example' },
    };
    expect(ids(config)).toEqual([
      ['agent-manager', '/agent-platform'],
      ['api-platform', 'https://api.example'],
      ['integration-platform', '/'],
      ['identity-platform', 'https://id.example'],
    ]);
  });

  it('shows a coming-soon platform without its URL, but never this console', () => {
    const config = { platformUrls: { 'agent-manager': 'https://agent.example' }, comingSoonPlatforms: ['agent-manager', 'identity-platform', 'integration-platform'] };
    expect(ids(config)).toEqual([
      ['agent-manager', null],
      ['integration-platform', '/'],
      ['identity-platform', null],
    ]);
  });
});
