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

/** Static copy and defaults for the cloud API consumption + security surface. */

import type { SecurityMode } from '../types/consumers';

/** Gateway default for the `api-key-auth` policy. */
export const DEFAULT_API_KEY_HEADER = 'X-API-Key';

export const OAUTH_HEADER = 'Authorization';

/** Stand-in shown wherever a consumer's credential is hidden. */
export const TOKEN_MASK = '•'.repeat(28);

export const COMING_SOON_OAUTH = 'Securing with OAuth coming soon';
export const COMING_SOON_UPSTREAM_ATTRS = 'Passing end-user attributes to upstream coming soon';

export const API_KEY_SCHEME_DESCRIPTION = 'Secure your API with API Key protocol.';
export const OAUTH_SCHEME_DESCRIPTION = 'Secure your API with OAuth 2 protocol.';

export const REGENERATE_KEY_WARNING = 'The current key is revoked immediately and replaced. Any client still presenting the previous key will be rejected until it is updated.';
export const REVOKE_KEY_WARNING = 'The key is revoked immediately and requests presenting it will be rejected. The consumer application is retained and can be issued a new key.';
export const DELETE_CONSUMER_WARNING = 'The key is revoked and the consumer application is permanently removed. This action cannot be undone.';

export const TOKEN_ONE_TIME_WARNING = 'This key is displayed once and is not stored in retrievable form. Copy it to a secure location before closing this panel.';

export const TOKEN_NOT_RETRIEVABLE_NOTICE = 'This key was displayed once at creation and cannot be retrieved. Regenerate to issue a replacement.';

export const CONSUMER_NAME_TAKEN = 'A consumer with this name already exists for this endpoint.';

export const SECURITY_MODE_LABEL: Record<SecurityMode, string> = {
  none: 'No Auth',
  'api-key': 'API Key',
  jwt: 'OAuth',
};
