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

/** Identifies one deployed endpoint's gateway API — the path triple every security call takes, and the deployment track it belongs to. */
export interface EndpointRef {
  componentName: string;
  environmentName: string;
  endpointName: string;
  /**
   * Each deployment track has its own API, with its own URL, security and keys. Required, so a caller can't
   * silently act on the default track's API; undefined while the page hasn't resolved its track.
   */
  deploymentTrackId: string | undefined;
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
  /** When the key expires (RFC 3339). A test key states it; without it, the default validity applies. */
  expiresAt?: string;
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
  jwt?: JwtSecurity;
  /** Gateway invoke URL, distinct from the component's open raw route. Populated on GET, ignored on PUT. */
  publicUrl?: string;
  /** Routes the API secures, CORS preflights left out: the keys `jwt.operations` accepts. Read-only: ignored on PUT. */
  operations?: EndpointPolicyOperation[];
  /** False outside the pipeline's entry environment, where the API only changes by promotion. Absent from older BFFs: editable. */
  editable?: boolean;
  entryEnvironment?: string;
  /** The environment runs a build made before builds recorded their settings, so what it enforces is unknown. */
  stateUnknown?: boolean;
  /**
   * Set when Agent Manager's AI gateway fronts the endpoint instead of the API Platform, as it does an MCP server.
   * `publicUrl` is then the full MCP URL, MCP path included. Its keys come from Agent Manager: agents get theirs there,
   * and a person gets a short-lived test key through ipaas-service.
   */
  aiGateway?: AiGatewayBinding;
}

/** Where an endpoint's deployment on the AI gateway stands. */
export interface AiGatewayBinding {
  /** Absent while the environment has no AI gateway; `deploymentStatusReason` is then `NO_GATEWAY`. */
  deploymentStatus?: 'Deploying' | 'Deployed' | 'Failed';
  deploymentStatusReason?: string;
}

/**
 * Options of the jwt mode. The key manager, audiences and token options apply to every operation;
 * scopes are set per operation. GET fills every token option with the value in force. PUT replaces
 * the whole block, so an option left out takes its default.
 */
export interface JwtSecurity {
  /** Gateway key-manager names to trust (not URLs). Empty defaults to `ThunderKeyManager`, the only name accepted today. */
  issuers?: string[];
  /** Accepted `aud` claim values; a token must carry at least one. Empty skips the audience check. */
  audiences?: string[];
  /** Each operation's scope requirement, keyed `"<METHOD> <path>"`. An operation left out needs no scope. */
  operations?: Record<string, ScopeRequirement>;
  /** Request header clients send the token in (default `Authorization`). */
  headerName?: string;
  /** Scheme in front of the token, as in `Bearer <token>` (default `Bearer`). */
  authHeaderPrefix?: string;
  /** Whether the backend receives the token (default true). */
  forwardToken?: boolean;
  /** Header the backend receives the token in (default `X-Forwarded-Authorization`). */
  forwardedTokenHeader?: string;
  /** Forward only the token, without the prefix (default false). */
  forwardTokenStripScheme?: boolean;
}

/** The scopes one operation requires, checked against the token's `scope` claim. When both lists are set, both must hold. */
export interface ScopeRequirement {
  /** Every scope listed must be in the token. */
  allOf?: string[];
  /** At least one scope listed must be in the token. */
  anyOf?: string[];
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
  /** See SecurityConfig.editable. Read-only: ignored on PUT. */
  editable?: boolean;
  entryEnvironment?: string;
  stateUnknown?: boolean;
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
