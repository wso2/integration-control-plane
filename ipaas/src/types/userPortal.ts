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
 * - `active`: running at `url`.
 * - `failed`: its provisioning stopped at a step; `error` says which and why.
 * - `removing`: being torn down after a disable.
 */
export type UserPortalState = 'not-enabled' | 'setting-up' | 'active' | 'failed' | 'removing';

export interface UserPortal {
  /** The environment's slug. */
  environment: string;
  state: UserPortalState;
  /** The portal's address, once it has one. */
  url?: string;
  /** Why provisioning failed, for a `failed` portal. */
  error?: string;
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
}

/** The outcome of a publish. */
export interface UserPortalPublication {
  environment: string;
  published: boolean;
  /** Scopes the integration's endpoints require that the User Portal can't hold, so its users' tokens never carry them. */
  rejectedScopes: string[];
}
