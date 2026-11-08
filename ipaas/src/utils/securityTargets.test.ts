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
import type { EnvEndpoint } from '../types/component';
import type { PromotionTreeNode } from '../types/deploymentPipeline';
import type { Environment } from '../types/environment';
import { exposedEndpoints, securityEnvironments, securityLinkState, targetFromEndpoints, type SecurityTarget } from './securityTargets';

const env = (id: string, name = id): Environment => ({ id, name, critical: false });
const dev = env('development', 'Development');
const prod = env('production', 'Production');
const pipeline = (...entries: string[]) => ({ env_name: 'Root', children: entries.map((env_name) => ({ env_name, children: [] })) }) as unknown as PromotionTreeNode;

const endpoint = (id: string, status?: string): EnvEndpoint => ({ id, displayName: id, visibilityStatus: status ? { public: { status } } : undefined }) as unknown as EnvEndpoint;

describe('securityEnvironments', () => {
  it('offers the pipeline’s entry environments', () => {
    expect(securityEnvironments(pipeline('development'), [dev, prod])).toEqual([dev]);
  });

  it('offers every entry when there are several', () => {
    const qa = env('qa');
    expect(securityEnvironments(pipeline('development', 'qa'), [dev, qa, prod])).toEqual([dev, qa]);
  });

  it('offers every environment with no pipeline, or one whose entries match none', () => {
    expect(securityEnvironments(null, [dev, prod])).toEqual([dev, prod]);
    expect(securityEnvironments(pipeline('staging'), [dev, prod])).toEqual([dev, prod]);
  });
});

describe('exposedEndpoints', () => {
  it('keeps endpoints on the gateway, UNKNOWN included', () => {
    const eps = [endpoint('a', 'ENABLED'), endpoint('b', 'UNKNOWN'), endpoint('c', 'ENABLING'), endpoint('d', 'FAILED'), endpoint('e')];
    expect(exposedEndpoints(eps).map((ep) => ep.id)).toEqual(['a', 'b']);
  });
});

describe('targetFromEndpoints', () => {
  it('is ready on the exposed endpoints only', () => {
    const target = targetFromEndpoints(dev, [endpoint('project-only'), endpoint('api', 'ENABLED')]);
    expect(target.status).toBe('ready');
    expect(target.status === 'ready' && target.endpoints.map((ep) => ep.id)).toEqual(['api']);
  });

  it('is not exposed with none on the gateway', () => {
    expect(targetFromEndpoints(dev, [endpoint('project-only')]).status).toBe('notExposed');
  });
});

describe('securityLinkState', () => {
  const t = (e: Environment, status: Exclude<SecurityTarget['status'], 'ready'>): SecurityTarget => ({ env: e, status });
  const ready = (e: Environment) => targetFromEndpoints(e, [endpoint('api', 'ENABLED')]);

  it('opens once any environment is ready, naming where it applies', () => {
    expect(securityLinkState([ready(dev), t(prod, 'loading')])).toEqual({ action: 'open', hint: 'Set in Development. Promote to apply it to later environments.' });
  });

  it('waits while nothing is ready and something is loading', () => {
    expect(securityLinkState([t(dev, 'loading'), t(prod, 'notDeployed')]).action).toBe('wait');
  });

  it('offers a retry for a deployment that couldn’t be read, rather than asking to deploy', () => {
    expect(securityLinkState([t(dev, 'error')])).toEqual({ action: 'retry', hint: 'Couldn’t check Development’s deployment. Select to try again.' });
  });

  it('says when nothing is exposed, before asking to deploy', () => {
    expect(securityLinkState([t(dev, 'notExposed'), t(prod, 'notDeployed')]).hint).toContain('No endpoint in Development is exposed');
    expect(securityLinkState([t(dev, 'notDeployed'), t(prod, 'notDeployed')]).hint).toBe('Deploy to Development or Production to configure security.');
  });
});
