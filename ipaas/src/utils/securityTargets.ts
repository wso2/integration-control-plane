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

import type { EnvEndpoint } from '../types/component';
import type { PromotionTreeNode } from '../types/deploymentPipeline';
import type { Environment } from '../types/environment';
import { gatewayExposureState } from './endpoints';
import { isEntryEnvironment } from './entryEnvironment';

/** Where one environment stands for "Configure security": `ready` has at least one exposed endpoint. */
export type SecurityTarget = { env: Environment; status: 'loading' | 'error' | 'notDeployed' | 'notExposed' } | { env: Environment; status: 'ready'; endpoints: [EnvEndpoint, ...EnvEndpoint[]] };

/**
 * The environments an API's security can be changed in: the pipeline's entry environments, which
 * pass it on by promotion. With no pipeline to read, every environment is offered, as
 * isEntryEnvironment allows. So is every environment when the pipeline's entries match none of
 * them, since then nothing says which one takes changes. The BFF refuses a change outside its own
 * entry, and the drawer then says where to make it.
 */
export function securityEnvironments(tree: PromotionTreeNode | null, environments: Environment[]): Environment[] {
  const entries = environments.filter((env) => isEntryEnvironment(tree, env.id));
  return entries.length ? entries : environments;
}

/** Endpoints on the gateway, so with an API whose security can be set. UNKNOWN still counts, as on the env card. */
export function exposedEndpoints(endpoints: EnvEndpoint[]): EnvEndpoint[] {
  return endpoints.filter((ep) => {
    const { state } = gatewayExposureState(ep.visibilityStatus);
    return state === 'enabled' || state === 'unknown';
  });
}

/** An environment's target once its endpoints are known. */
export function targetFromEndpoints(env: Environment, endpoints: EnvEndpoint[]): SecurityTarget {
  const [first, ...rest] = exposedEndpoints(endpoints);
  return first ? { env, status: 'ready', endpoints: [first, ...rest] } : { env, status: 'notExposed' };
}

const names = (targets: SecurityTarget[]): string => targets.map((t) => t.env.name).join(' or ');

/**
 * What the header's "Configure security" link does, and its tooltip. `open` opens the drawer,
 * `retry` reads the environments whose deployment couldn't be read again, `wait` and `blocked` are
 * disabled. One environment ready is enough to open, even while another one is still loading.
 */
export function securityLinkState(targets: SecurityTarget[]): { action: 'open' | 'retry' | 'wait' | 'blocked'; hint: string } {
  const of = (status: SecurityTarget['status']) => targets.filter((t) => t.status === status);
  const ready = of('ready');
  if (ready.length) return { action: 'open', hint: `Set in ${names(ready)}. Promote to apply it to later environments.` };
  if (of('loading').length) return { action: 'wait', hint: '' };
  const failed = of('error');
  if (failed.length) return { action: 'retry', hint: `Couldn’t check ${names(failed)}’s deployment. Select to try again.` };
  const notExposed = of('notExposed');
  if (notExposed.length) return { action: 'blocked', hint: `No endpoint in ${names(notExposed)} is exposed as an API yet. Set an endpoint’s visibility to Public, then deploy.` };
  return { action: 'blocked', hint: `Deploy to ${names(targets)} to configure security.` };
}
