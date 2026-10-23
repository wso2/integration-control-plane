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
 * API security & exposure domain. The spec calls
 * the credential a subscription token, but the BFF ships no `/subscriptions`
 * routes, so it is an endpoint api-key sent as `X-API-Key`.
 */

/** Identifies one deployed endpoint — the path triple every security call takes. */
export interface EndpointRef {
  projectName: string;
  componentName: string;
  environmentName: string;
  endpointName: string;
}

/** One selectable endpoint in the security drawer's endpoint picker. */
export interface EndpointOption {
  /** Endpoint name — the BFF's `endpointName` path segment. */
  name: string;
  displayName: string;
  networkVisibilities?: string[] | null;
  visibilityStatus?: import('./component').EndpointVisibilityStatus | null;
}

/** A service endpoint exposed as a managed API on the API Platform gateway. */
export interface ApiExposure {
  /** The API Platform REST API handle — also the credential's `restApiId`. */
  handle: string;
  /** Gateway context path. */
  context?: string;
  /** Handle of the gateway the API is deployed to. */
  gatewayId?: string;
  /** Deployment status on the gateway, e.g. `DEPLOYED`. */
  status?: string;
  /** Public URL of the exposed API, when resolvable. */
  publicUrl?: string;
}

/** A masked API key of an exposed endpoint API. */
export interface ApiKeySummary {
  /** Key name — the identifier used to revoke it. */
  name: string;
  displayName?: string;
  /** Masked form, e.g. `***abcde`. The plaintext is never retrievable. */
  maskedApiKey: string;
  status: string;
  expiresAt?: string;
}

/** Result of minting a key. `apiKey` is the plaintext, returned only here. */
export interface ApiKeyResult {
  keyId: string;
  displayName?: string;
  /** Plaintext API key — shown once, not retrievable later. */
  apiKey: string;
}

/** Payload for creating an API key on an exposed endpoint API. */
export interface CreateApiKeyInput {
  displayName?: string;
  /** ISO date-time. Omitted means the gateway default (no expiry). */
  expiresAt?: string;
}

/** Options for the `api-key-auth` gateway policy. */
export interface ApiKeyAuthOptions {
  /** Header/query param carrying the key. Defaults to `X-API-Key`. */
  key?: string;
  /** Where the key is read from. Defaults to `header`. */
  in?: string;
}

/** The gateway ANDs auth policies with no fallback, so exactly one mode is active at a time. */
export type SecurityMode = 'none' | 'api-key' | 'jwt';

/** The active security configuration of an exposed endpoint API (GET/PUT `.../security`). */
export interface SecurityConfig {
  mode: SecurityMode;
  apiKey?: {
    /** Request header carrying the key (default `X-API-Key`). */
    header?: string;
  };
  jwt?: {
    /** Gateway key-manager names to trust; empty defaults to the org key manager. */
    issuers?: string[];
    audiences?: string[];
  };
  /** Gateway invoke URL, distinct from the component's open raw route. Populated on GET, ignored on PUT. */
  publicUrl?: string;
}

/** The non-auth gateway behaviour of an exposed endpoint API (GET/PUT `.../policies`). */
export interface EndpointPolicyConfig {
  cors?: EndpointCorsPolicy;
  rateLimit?: EndpointRateLimitPolicy;
  /** Routes the exposed API has — what a per-operation limit attaches to. Read-only: ignored on PUT. */
  operations?: EndpointPolicyOperation[];
  /** Which of the CORS entries the platform seeded. Read-only: ignored on PUT. */
  platformOrigins?: string[];
  platformHeaders?: string[];
}

export interface EndpointPolicyOperation {
  /** `"<METHOD> <path>"` — the identity `EndpointRateLimitPolicy.operations` is keyed by. */
  key: string;
  method: string;
  path: string;
}

export interface EndpointCorsPolicy {
  enabled: boolean;
  /** Exact origins, a wildcard subdomain, or `['*']` for any. */
  allowOrigins?: string[];
  allowMethods?: string[];
  allowHeaders?: string[];
  allowCredentials: boolean;
}

/** `api` = one allowance for the whole API; `resource` = one per operation. */
export type EndpointRateLimitLevel = 'unlimited' | 'api' | 'resource';

export interface EndpointRateLimitPolicy {
  level: EndpointRateLimitLevel;
  requestCount?: number;
  timeUnit?: 'MINUTE' | 'HOUR' | 'DAY';
  /** Per-operation limits, keyed by `"<METHOD> <path>"`. Absent operations stay unlimited. */
  operations?: Record<string, { requestCount: number; timeUnit: 'MINUTE' | 'HOUR' | 'DAY' }>;
}

/** Normalised from the credential's raw status. A revoked consumer keeps its row. */
export type ConsumerStatus = 'active' | 'revoked';

/** A consumer application. Org-scoped and shared across the org. */
export interface ConsumerApplication {
  id: string;
  displayName?: string;
  projectId?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Payload for creating a consumer application. */
export interface CreateApplicationInput {
  displayName: string;
  /** Project handle the application belongs to. */
  projectName: string;
  description?: string;
}

/** A consumer application's credential for an exposed API. */
export interface ConsumerCredential {
  id: string;
  applicationId: string;
  /** Handle of the exposed API this credential grants access to. */
  restApiId: string;
  /** Plaintext, sent as `X-API-Key`. Populated only by the call that mints it. */
  token?: string;
  status?: string;
  createdAt?: string;
}

/** One row per consumer, whatever its credential history. */
export interface Consumer {
  /** Application id when one backs this row, else the api-key group the row was built from. */
  id: string;
  displayName: string;
  /** Absent for key-only rows — api-keys minted before applications were used. */
  application?: ConsumerApplication;
  credential: ConsumerCredential;
  status: ConsumerStatus;
  /** The consumer's live api-keys — revoked ones are excluded, having nothing left to revoke. */
  credentialIds: string[];
}

/** Payload for creating a consumer application and minting its credential in one step. */
export interface CreateConsumerInput extends EndpointRef {
  /** Project handle the new application belongs to. */
  projectName: string;
  /** Display name of the consumer application. */
  appName: string;
}
