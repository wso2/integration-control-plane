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

import { toUserPortal, toUserPortalPublishability } from './userPortal';

describe('toUserPortal', () => {
  it('reads an environment with no portal as not enabled', () => {
    expect(toUserPortal({ environment: 'dev', enabled: false })).toEqual({ environment: 'dev', state: 'not-enabled' });
  });

  // A suspended portal only carries the portal's API to a later environment; it serves no one.
  it('reads a suspended portal as not enabled', () => {
    expect(toUserPortal({ environment: 'dev', enabled: false, suspended: true, state: 'DONE', portalUrl: 'https://dev-up.example' })).toEqual({ environment: 'dev', state: 'not-enabled' });
  });

  it('reads a provision still running as setting up', () => {
    for (const state of ['PENDING', 'APPLIED', 'MIGRATING']) {
      expect(toUserPortal({ environment: 'prod', enabled: true, state }).state).toBe('setting-up');
    }
  });

  it('reads a finished provision as active, with its URL', () => {
    expect(toUserPortal({ environment: 'prod', enabled: true, state: 'DONE', portalUrl: 'https://prod-up.example' })).toEqual({ environment: 'prod', state: 'active', url: 'https://prod-up.example' });
  });

  it('keeps the URL off a portal that is not active', () => {
    expect(toUserPortal({ environment: 'prod', enabled: true, state: 'PENDING', portalUrl: 'https://prod-up.example' })).not.toHaveProperty('url');
  });

  // A disable answers with the portal still enabled and its provision DELETING.
  it('reads a portal being deleted as removing, enabled or not', () => {
    expect(toUserPortal({ environment: 'prod', enabled: true, state: 'DELETING' }).state).toBe('removing');
    expect(toUserPortal({ environment: 'prod', enabled: false, state: 'DELETING' }).state).toBe('removing');
  });

  it('reads a failed portal as failed, with its reason, suspended or not', () => {
    expect(toUserPortal({ environment: 'prod', enabled: true, state: 'FAILED', error: 'portal: readiness timed out' })).toEqual({ environment: 'prod', state: 'failed', error: 'portal: readiness timed out' });
    expect(toUserPortal({ environment: 'dev', enabled: false, suspended: true, state: 'FAILED' }).state).toBe('failed');
  });
});

describe('toUserPortalPublishability', () => {
  it('keeps every reason, in order', () => {
    const reasons = [
      { code: 'USER_PORTAL_PIPELINE', message: 'pipeline' },
      { code: 'USER_PORTAL_NOT_ENABLED', message: 'not enabled' },
    ];
    expect(toUserPortalPublishability({ environment: 'prod', published: false, publishable: false, reasons })).toEqual({ environment: 'prod', published: false, publishable: false, reasons });
  });

  it('gives a publishable integration an empty reasons list', () => {
    expect(toUserPortalPublishability({ environment: 'prod', published: true, publishable: true }).reasons).toEqual([]);
  });
});
