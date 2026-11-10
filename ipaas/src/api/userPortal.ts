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
 * The org's User Portal, per environment, and publishing integrations to it. Calls ipaas-service:
 *   GET|PUT|DELETE /user-portal/environments/{environment}
 *   GET /components/{component}/user-portal
 *   GET|PUT|DELETE /components/{component}/user-portal/environments/{environment}
 */

import type { Environment } from '../types/environment';
import type { UserPortal, UserPortalPublication, UserPortalPublications, UserPortalPublishability, UserPortalState } from '../types/userPortal';
import { bff, seg } from './_client';
import { fetchAllEnvironments } from './environments';
import { DEFAULT_PIPELINE_NAME, fetchDeploymentPipeline } from './deploymentPipelines';
import { orderEnvironmentsByPipeline, pipelineEnvOrder } from '../utils/environmentOrder';

// models.UserPortalStatus. `state` is the orchestrator provision's: PENDING, APPLIED (in
// progress), DONE, FAILED, MIGRATING, DELETING. It is missing when the environment has no portal.
interface BffUserPortalStatus {
  environment: string;
  enabled: boolean;
  suspended?: boolean;
  state?: string;
  portalUrl?: string;
  error?: string;
}

// The provision states of a portal still being set up. Any other, a state added later or none,
// would read as setting up and poll forever, so it reads as failed.
const SETTING_UP = new Set(['PENDING', 'APPLIED', 'MIGRATING']);

// A suspended portal only carries the portal's API to a later environment, so it reads as not
// enabled: enabling it there makes it active.
function portalState(s: BffUserPortalStatus): { state: UserPortalState; error?: string } {
  const state = s.state?.toUpperCase();
  if (state === 'DELETING') return { state: 'removing' };
  if (state === 'FAILED') return { state: 'failed', ...(s.error ? { error: s.error } : {}) };
  if (!s.enabled) return { state: 'not-enabled' };
  if (state === 'DONE') return { state: 'active' };
  if (state && SETTING_UP.has(state)) return { state: 'setting-up' };
  return { state: 'failed', error: state ? `The User Portal is in a state the console doesn't know: ${state}.` : 'ipaas-service reported no state for the User Portal.' };
}

export const toUserPortal = (s: BffUserPortalStatus): UserPortal => {
  const { state, error } = portalState(s);
  return {
    environment: s.environment,
    state,
    ...(s.portalUrl && state === 'active' ? { url: s.portalUrl } : {}),
    ...(error ? { error } : {}),
  };
};

/**
 * The environments a User Portal can run in: those of the org's default deployment pipeline, in
 * promotion order. The portal's own API moves along that pipeline, so ipaas-service refuses others.
 * A pipeline with no promotion paths names no environment, so there is none.
 */
export const fetchUserPortalEnvironments = async (): Promise<Environment[]> => {
  const [environments, pipeline] = await Promise.all([fetchAllEnvironments(), fetchDeploymentPipeline(DEFAULT_PIPELINE_NAME)]);
  const chain = new Set(pipelineEnvOrder(pipeline.promotion_tree));
  return orderEnvironmentsByPipeline(
    environments.filter((e) => chain.has(e.id)),
    pipeline.promotion_tree,
  );
};

const portalPath = (environment: string) => `/user-portal/environments/${seg(environment)}`;

export const fetchUserPortal = (environment: string): Promise<UserPortal> => bff.get<BffUserPortalStatus>(portalPath(environment)).then(toUserPortal);

/** Starts provisioning; the portal reads as setting up until it is ready. Enabling a failed portal retries it. */
export const enableUserPortal = (environment: string): Promise<UserPortal> => bff.put<BffUserPortalStatus>(portalPath(environment)).then(toUserPortal);

/** Unpublishes the portal's integrations, then stops it; the portal reads as removing until it is gone. */
export const disableUserPortal = (environment: string): Promise<UserPortal> => bff.delete<BffUserPortalStatus>(portalPath(environment)).then(toUserPortal);

// models.UserPortalPublishability; `reasons` is always a list.
interface BffUserPortalPublishability {
  environment: string;
  published: boolean;
  publishable: boolean;
  reasons?: { code: string; message: string }[];
  redeploys?: boolean;
  publishing?: boolean;
  publishError?: { code: string; message: string };
  unpublishing?: boolean;
  unpublishError?: { code: string; message: string };
  rejectedScopes?: string[];
}

// models.UserPortalPublications.
interface BffUserPortalPublications {
  environments?: string[];
  unpublishing?: string[];
}

// models.UserPortalPublication.
interface BffUserPortalPublication {
  environment: string;
  published: boolean;
  publishing?: boolean;
  unpublishing?: boolean;
  rejectedScopes?: string[];
}

const publicationPath = (componentId: string, environment: string) => `/components/${seg(componentId)}/user-portal/environments/${seg(environment)}`;

export const toUserPortalPublishability = (p: BffUserPortalPublishability): UserPortalPublishability => ({
  environment: p.environment,
  published: p.published,
  publishable: p.publishable,
  reasons: p.reasons ?? [],
  // A BFF from before publishing switched workflows to the User Portal's sign-in never redeploys.
  redeploys: p.redeploys ?? false,
  publishing: p.publishing ?? false,
  ...(p.publishError ? { publishError: p.publishError } : {}),
  // A BFF from before unpublishing finished in the background answers once the workflow is given back.
  unpublishing: p.unpublishing ?? false,
  ...(p.unpublishError ? { unpublishError: p.unpublishError } : {}),
  rejectedScopes: p.rejectedScopes ?? [],
});

export const toUserPortalPublications = (p: BffUserPortalPublications): UserPortalPublications => ({ environments: p.environments ?? [], unpublishing: p.unpublishing ?? [] });

/** The environments the integration is published to the User Portal in. */
export const fetchUserPortalPublications = (componentId: string): Promise<UserPortalPublications> => bff.get<BffUserPortalPublications>(`/components/${seg(componentId)}/user-portal`).then(toUserPortalPublications);

/** Runs a publish's rules without publishing: whether it is published there, and every rule it breaks. */
export const fetchUserPortalPublishability = (componentId: string, environment: string): Promise<UserPortalPublishability> => bff.get<BffUserPortalPublishability>(publicationPath(componentId, environment)).then(toUserPortalPublishability);

const toPublication = (p: BffUserPortalPublication): UserPortalPublication => ({ environment: p.environment, published: p.published, publishing: p.publishing ?? false, unpublishing: p.unpublishing ?? false, rejectedScopes: p.rejectedScopes ?? [] });

export const publishToUserPortal = (componentId: string, environment: string): Promise<UserPortalPublication> => bff.put<BffUserPortalPublication>(publicationPath(componentId, environment)).then(toPublication);

export const unpublishFromUserPortal = (componentId: string, environment: string): Promise<UserPortalPublication> => bff.delete<BffUserPortalPublication>(publicationPath(componentId, environment)).then(toPublication);
