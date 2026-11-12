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

/** The org's User Portal, one per environment, and the integrations published to it. */

/**
 * Where an environment's User Portal is, as the console shows it.
 * - `not-enabled`: no portal runs there. A portal kept suspended for a later environment's sake also reads so: it serves no one.
 * - `setting-up`: being provisioned; it opens once ready.
 * - `starting`: provisioned, and its pods are starting, on a first run or a new version's rollout.
 * - `active`: running at `url`.
 * - `unhealthy`: provisioned, but not ready; `readinessMessage` says why. Some of these recover on their own.
 * - `failed`: its provisioning stopped at a step; `error` says which and why.
 * - `removing`: being torn down after a disable.
 */
export type UserPortalState = 'not-enabled' | 'setting-up' | 'starting' | 'active' | 'unhealthy' | 'failed' | 'removing';

export interface UserPortal {
  /** The environment's slug. */
  environment: string;
  state: UserPortalState;
  /** The portal's address, once it has one. */
  url?: string;
  /** Why provisioning failed, for a `failed` portal. */
  error?: string;
  /** Why an `unhealthy` portal isn't ready, in OpenChoreo's words, so it is shown only as a detail. */
  readinessMessage?: string;
}

/** A publishing rule an integration breaks: the code a publish answers with, and what to change. */
export interface UserPortalRefusal {
  code: string;
  message: string;
}

/** Whether an integration is, and can be, published to one environment's User Portal. */
export interface UserPortalPublishability {
  environment: string;
  published: boolean;
  publishable: boolean;
  /** Every rule it breaks there, in the order a publish checks them. Empty when publishable. */
  reasons: UserPortalRefusal[];
  /**
   * Publishing redeploys the workflow so its Workflow Management API takes only User Portal sign-ins, on the
   * gateway and in the workflow itself. The console's workflow views stop working there: the User Portal is
   * where its runs and tasks are managed.
   */
  redeploys: boolean;
  /**
   * A publish that redeploys a workflow finishes in the background: it is running, and `published` stays false until it
   * completes.
   */
  publishing: boolean;
  /** Why the last background publish failed, as a publish's refusal; it ends when another publish starts or the integration is unpublished. */
  publishError?: UserPortalRefusal;
  /**
   * An unpublished workflow is still being redeployed to take the console's API key again, in the background. It is out
   * of the User Portal already (`published` is false), and can't be published again until this ends.
   */
  unpublishing: boolean;
  /** Why the workflow couldn't be given back to the console after the last unpublish; unpublishing again finishes it. */
  unpublishError?: UserPortalRefusal;
  /** Scopes the last background publish's endpoints require that the User Portal can't hold, while published. */
  rejectedScopes: string[];
}

/** The environments an integration is published to the User Portal in. */
export interface UserPortalPublications {
  /** The environments' slugs. */
  environments: string[];
  /** The environments a workflow was unpublished from and is still being redeployed in to take the console's API key again. */
  unpublishing: string[];
  /** The environments a workflow was unpublished from but couldn't be redeployed in to take the console's API key again. */
  notGivenBack: string[];
}

/** The outcome of a publish or an unpublish. */
export interface UserPortalPublication {
  environment: string;
  published: boolean;
  /** The publish was accepted and finishes in the background; the publishability says when it ends. */
  publishing: boolean;
  /** The workflow is unpublished, and is given back to the console in the background; the publishability says when that ends. */
  unpublishing: boolean;
  /** Scopes the integration's endpoints require that the User Portal can't hold, so its users' tokens never carry them. */
  rejectedScopes: string[];
}
