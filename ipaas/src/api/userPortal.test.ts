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

import { describe, expect, it, vi } from 'vitest';

import { fetchDeploymentPipeline } from './deploymentPipelines';
import { fetchAllEnvironments } from './environments';
import { fetchUserPortalEnvironments, toUserPortal, toUserPortalPublications, toUserPortalPublishability } from './userPortal';
import type { DeploymentPipeline, PromotionTreeNode } from '../types/deploymentPipeline';
import type { Environment } from '../types/environment';

vi.mock('./environments', () => ({ fetchAllEnvironments: vi.fn() }));
vi.mock('./deploymentPipelines', () => ({ DEFAULT_PIPELINE_NAME: 'default', fetchDeploymentPipeline: vi.fn() }));

const env = (id: string): Environment => ({ id, name: id, critical: id === 'production' });
const node = (id: string, ...children: PromotionTreeNode[]): PromotionTreeNode => ({ env_template_id: id, env_name: id, ...(children.length ? { children } : {}) });
const pipeline = (...roots: PromotionTreeNode[]): DeploymentPipeline => ({ id: 'default', created_at: '', organization_uuid: '', name: 'default', is_default: true, promotion_tree: { name: 'Root', children: roots } });

describe('fetchUserPortalEnvironments', () => {
  it("lists the default pipeline's environments, in promotion order", async () => {
    vi.mocked(fetchAllEnvironments).mockResolvedValue([env('production'), env('sandbox'), env('development')]);
    vi.mocked(fetchDeploymentPipeline).mockResolvedValue(pipeline(node('development', node('production'))));
    expect((await fetchUserPortalEnvironments()).map((e) => e.id)).toEqual(['development', 'production']);
  });

  // ipaas-service knows only the environments a promotion path names, so it would refuse every one.
  it('lists none when the default pipeline has no promotion paths', async () => {
    vi.mocked(fetchAllEnvironments).mockResolvedValue([env('development'), env('production')]);
    vi.mocked(fetchDeploymentPipeline).mockResolvedValue(pipeline());
    expect(await fetchUserPortalEnvironments()).toEqual([]);
  });
});

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

  // Read as setting up, these would poll forever.
  it('reads an enabled portal in an unknown state, or none, as failed, saying why', () => {
    expect(toUserPortal({ environment: 'prod', enabled: true, state: 'PAUSED' })).toEqual({ environment: 'prod', state: 'failed', error: "The User Portal is in a state the console doesn't know: PAUSED." });
    expect(toUserPortal({ environment: 'prod', enabled: true })).toEqual({ environment: 'prod', state: 'failed', error: 'ipaas-service reported no state for the User Portal.' });
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
    expect(toUserPortalPublishability({ environment: 'prod', published: false, publishable: false, reasons, redeploys: true })).toEqual({
      environment: 'prod',
      published: false,
      publishable: false,
      reasons,
      redeploys: true,
      publishing: false,
      rejectedScopes: [],
    });
  });

  it('gives a publishable integration an empty reasons list', () => {
    expect(toUserPortalPublishability({ environment: 'prod', published: true, publishable: true }).reasons).toEqual([]);
    expect(toUserPortalPublishability({ environment: 'prod', published: true, publishable: true }).redeploys).toBe(false);
  });

  it('reads a BFF that reports no background publish as none running, with no scopes or error', () => {
    const report = toUserPortalPublishability({ environment: 'prod', published: true, publishable: true });
    expect(report.publishing).toBe(false);
    expect(report.rejectedScopes).toEqual([]);
    expect(report.publishError).toBeUndefined();
  });

  it('carries a running background publish, its last failure and the scopes of its last success', () => {
    const publishError = { code: 'USER_PORTAL_PUBLISH_INTERRUPTED', message: 'interrupted' };
    expect(toUserPortalPublishability({ environment: 'prod', published: false, publishable: true, publishing: true, publishError })).toMatchObject({ publishing: true, publishError });
    expect(toUserPortalPublishability({ environment: 'prod', published: true, publishable: true, rejectedScopes: ['bad'] }).rejectedScopes).toEqual(['bad']);
  });
});

describe('toUserPortalPublications', () => {
  it('reads an integration the BFF lists no environments for as published nowhere', () => {
    expect(toUserPortalPublications({})).toEqual({ environments: [] });
    expect(toUserPortalPublications({ environments: ['development'] })).toEqual({ environments: ['development'] });
  });
});
