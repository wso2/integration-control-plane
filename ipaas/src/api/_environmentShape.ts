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
 * The BFF environment wire shape, and the one mapper that normalizes it.
 *
 * Two domain modules need this: `environments.ts` for environment CRUD, and
 * `deploymentPipelines.ts` to project environments into promotion-chain templates.
 * It lives in its own module so neither of them has to depend on the other —
 * `environments.ts` already imports `appendEnvironmentToDefaultPipeline` from
 * `deploymentPipelines.ts`, so exporting the mapper from `environments.ts` instead
 * would close an import cycle.
 *
 * Keeping a second, hand-rolled copy of this shape is what caused pipelines to be
 * written with environment display names instead of slugs: the duplicate read `name`
 * as the slug, so every promotion ref built from it pointed at a label
 * ("Development") rather than an environment ("development"), and autoDeploy then
 * failed for every component in the project. Add fields here, not in a local
 * interface.
 */

import type { Environment } from '../types/environment';

// OpenChoreo Environments are K8s resources: `name` is an RFC 1123 slug and the
// identity used in every path (`/environments/{name}`) and in a pipeline's
// promotion refs, while the human label lives in `displayName`. The frontend
// Environment carries `id` (slug) and `name` (label) and expresses "production"
// as `critical`, so we translate between the two shapes at the boundary.
export interface BffEnvironment {
  // The BFF serves the RFC 1123 slug as `id` and the human label as `name`, and
  // flags production via `critical` with the dataplane in `dpId`. The
  // slug/displayName/isProduction/dataPlaneRef aliases are tolerated as fallbacks.
  id?: string;
  uid?: string;
  name: string;
  displayName?: string;
  description?: string;
  dataPlaneRef?: string;
  dpId?: string;
  isProduction?: boolean;
  critical?: boolean;
  createdAt?: string;
}

// `id` must be the slug used in every path (`/environments/{name}`), in a pipeline's
// promotion refs, and in the immutable ReleaseBinding `spec.environment` — NOT the
// display label, or deploys mismatch the binding (e.g. label "Development" vs slug
// "development").
export const toEnvironment = (e: BffEnvironment): Environment => ({
  id: e.id || e.name,
  name: e.displayName || e.name,
  critical: e.critical ?? e.isProduction ?? false,
  description: e.description,
  createdAt: e.createdAt,
  dpId: e.dpId ?? e.dataPlaneRef,
});
