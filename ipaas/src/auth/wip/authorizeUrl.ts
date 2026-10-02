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

interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  resource?: string;
  fidp?: string;
}

export function buildAuthorizationUrl(endpoint: string, request: AuthorizationRequest): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    scope: request.scope,
    state: request.state,
    code_challenge: request.codeChallenge,
    code_challenge_method: 'S256',
  });
  if (request.resource?.trim()) params.set('resource', request.resource.trim());
  if (request.fidp) params.set('fidp', request.fidp);
  return `${endpoint}?${params}`;
}

interface LogoutRequest {
  clientId: string;
  postLogoutRedirectUri: string;
  idTokenHint?: string | null;
}

// RP-initiated logout. The IdP's end-session endpoint sits beside its authorize
// endpoint (/oauth2/authorize → /oauth2/logout), so derive it rather than add config.
export function buildLogoutUrl(authorizeEndpoint: string, request: LogoutRequest): string {
  const endpoint = authorizeEndpoint.replace(/\/authorize\/?$/, '/logout');
  const params = new URLSearchParams({
    client_id: request.clientId,
    post_logout_redirect_uri: request.postLogoutRedirectUri,
  });
  if (request.idTokenHint) params.set('id_token_hint', request.idTokenHint);
  return `${endpoint}?${params}`;
}
