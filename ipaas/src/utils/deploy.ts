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

import { DeploymentStatus } from '../types/deployment';
import type { ApimApiInfo } from '../types/apim';
import { API_KEY_SCHEME, OAUTH2_SCHEME } from '../constants/endpointConfig';
import type { EndpointSecurityState } from '../types/deploy';

export function getDeploymentStatusColor(status: DeploymentStatus | undefined): 'success' | 'error' | 'warning' | 'info' | 'default' {
  switch (status) {
    case DeploymentStatus.Active:
      return 'success';
    case DeploymentStatus.Error:
      return 'error';
    case DeploymentStatus.InProgress:
      return 'info';
    case DeploymentStatus.Suspended:
      return 'warning';
    case DeploymentStatus.NotDeployed:
    default:
      return 'default';
  }
}

export function getDeploymentStatusLabel(status: DeploymentStatus | undefined): string {
  switch (status) {
    case DeploymentStatus.Active:
      return 'Active';
    case DeploymentStatus.Error:
      return 'Error';
    case DeploymentStatus.InProgress:
      return 'In progress';
    case DeploymentStatus.Suspended:
      return 'Suspended';
    case DeploymentStatus.NotDeployed:
    default:
      return 'Not deployed';
  }
}

/** Returns true when the deployment is in a terminal steady state (no action in flight). */
export function isDeploymentSettled(status: DeploymentStatus | undefined): boolean {
  return status !== DeploymentStatus.InProgress;
}

export function buildEndpointSecurityState(apimApiInfo: ApimApiInfo | null | undefined): EndpointSecurityState {
  const operationScopes: Record<string, string[]> = {};
  for (const op of apimApiInfo?.operations ?? []) {
    const key = `${op.verb.toUpperCase()}-${op.target}`;
    operationScopes[key] = op.scopes ?? [];
  }

  return {
    securityScheme: apimApiInfo?.securityScheme ?? [OAUTH2_SCHEME],
    apiKeyHeader: apimApiInfo?.apiKeyHeader ?? 'ApiKey',
    authorizationHeader: apimApiInfo?.authorizationHeader ?? 'Authorization',
    enableBackendJWT: apimApiInfo?.enableBackendJWT ?? false,
    backendJWTAudiences: apimApiInfo?.backendJWTConfiguration?.audiences ?? [],
    operationScopes,
    opSearch: '',
    opPage: 0,
  };
}

export function toggleSchemeToken(current: string[], token: typeof API_KEY_SCHEME | typeof OAUTH2_SCHEME): string[] {
  const next = current.includes(token) ? current.filter((s) => s !== token) : [...current, token];
  if (!next.includes(API_KEY_SCHEME) && !next.includes(OAUTH2_SCHEME)) return [];
  return next;
}

export function extractScopesFromSwagger(swagger: unknown): string[] {
  if (!swagger || typeof swagger !== 'object') return [];
  const doc = swagger as Record<string, unknown>;
  const scopes: string[] = [];

  const components = doc.components as Record<string, unknown> | undefined;
  const securitySchemes = components?.securitySchemes as Record<string, unknown> | undefined;
  for (const scheme of Object.values(securitySchemes ?? {})) {
    const s = scheme as Record<string, unknown>;
    if (s.type === 'oauth2') {
      const flows = s.flows as Record<string, unknown> | undefined;
      for (const flow of Object.values(flows ?? {})) {
        const f = flow as Record<string, unknown>;
        for (const name of Object.keys((f.scopes as Record<string, string>) ?? {})) {
          if (!scopes.includes(name)) scopes.push(name);
        }
      }
    }
  }

  const securityDefinitions = doc.securityDefinitions as Record<string, unknown> | undefined;
  for (const scheme of Object.values(securityDefinitions ?? {})) {
    const s = scheme as Record<string, unknown>;
    if (s.type === 'oauth2') {
      for (const name of Object.keys((s.scopes as Record<string, string>) ?? {})) {
        if (!scopes.includes(name)) scopes.push(name);
      }
    }
  }

  return scopes;
}
