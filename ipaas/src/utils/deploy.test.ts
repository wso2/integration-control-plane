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

import { describe, it, expect } from 'vitest';
import { DeploymentStatus } from '../types/deployment';
import { API_KEY_SCHEME, OAUTH2_SCHEME } from '../constants/endpointConfig';
import { getDeploymentStatusColor, getDeploymentStatusLabel, isDeploymentSettled, toggleSchemeToken, extractScopesFromSwagger } from './deploy';

describe('getDeploymentStatusColor', () => {
  it('maps each status to the correct color key', () => {
    expect(getDeploymentStatusColor(DeploymentStatus.Active)).toBe('success');
    expect(getDeploymentStatusColor(DeploymentStatus.Error)).toBe('error');
    expect(getDeploymentStatusColor(DeploymentStatus.InProgress)).toBe('info');
    expect(getDeploymentStatusColor(DeploymentStatus.Suspended)).toBe('warning');
    expect(getDeploymentStatusColor(DeploymentStatus.NotDeployed)).toBe('default');
    expect(getDeploymentStatusColor(undefined)).toBe('default');
  });
});

describe('getDeploymentStatusLabel', () => {
  it('maps each status to the correct label', () => {
    expect(getDeploymentStatusLabel(DeploymentStatus.Active)).toBe('Active');
    expect(getDeploymentStatusLabel(DeploymentStatus.Error)).toBe('Error');
    expect(getDeploymentStatusLabel(DeploymentStatus.InProgress)).toBe('In progress');
    expect(getDeploymentStatusLabel(DeploymentStatus.Suspended)).toBe('Suspended');
    expect(getDeploymentStatusLabel(DeploymentStatus.NotDeployed)).toBe('Not deployed');
    expect(getDeploymentStatusLabel(undefined)).toBe('Not deployed');
  });
});

describe('isDeploymentSettled', () => {
  it('returns false only for InProgress', () => {
    expect(isDeploymentSettled(DeploymentStatus.InProgress)).toBe(false);
  });

  it('returns true for all terminal states', () => {
    expect(isDeploymentSettled(DeploymentStatus.Active)).toBe(true);
    expect(isDeploymentSettled(DeploymentStatus.Error)).toBe(true);
    expect(isDeploymentSettled(DeploymentStatus.Suspended)).toBe(true);
    expect(isDeploymentSettled(DeploymentStatus.NotDeployed)).toBe(true);
    expect(isDeploymentSettled(undefined)).toBe(true);
  });
});

describe('toggleSchemeToken', () => {
  it('adds a token that is not present', () => {
    expect(toggleSchemeToken([], OAUTH2_SCHEME)).toEqual([OAUTH2_SCHEME]);
    expect(toggleSchemeToken([OAUTH2_SCHEME], API_KEY_SCHEME)).toEqual([OAUTH2_SCHEME, API_KEY_SCHEME]);
  });

  it('removes a token that is already present', () => {
    expect(toggleSchemeToken([OAUTH2_SCHEME, API_KEY_SCHEME], API_KEY_SCHEME)).toEqual([OAUTH2_SCHEME]);
  });

  it('returns empty array when removing the last remaining scheme token', () => {
    expect(toggleSchemeToken([OAUTH2_SCHEME], OAUTH2_SCHEME)).toEqual([]);
    expect(toggleSchemeToken([API_KEY_SCHEME], API_KEY_SCHEME)).toEqual([]);
  });
});

describe('extractScopesFromSwagger', () => {
  it('returns empty array for non-object inputs', () => {
    expect(extractScopesFromSwagger(null)).toEqual([]);
    expect(extractScopesFromSwagger(undefined)).toEqual([]);
    expect(extractScopesFromSwagger('string')).toEqual([]);
    expect(extractScopesFromSwagger(42)).toEqual([]);
  });

  it('returns empty array when no security schemes exist', () => {
    expect(extractScopesFromSwagger({})).toEqual([]);
    expect(extractScopesFromSwagger({ components: {} })).toEqual([]);
  });

  it('extracts scopes from OpenAPI 3 oauth2 flows', () => {
    const swagger = {
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                scopes: { read: 'Read access', write: 'Write access' },
              },
            },
          },
        },
      },
    };
    expect(extractScopesFromSwagger(swagger)).toEqual(['read', 'write']);
  });

  it('extracts scopes from Swagger 2 securityDefinitions', () => {
    const swagger = {
      securityDefinitions: {
        oauth: {
          type: 'oauth2',
          scopes: { admin: 'Admin access' },
        },
      },
    };
    expect(extractScopesFromSwagger(swagger)).toEqual(['admin']);
  });

  it('deduplicates scopes across multiple flows', () => {
    const swagger = {
      components: {
        securitySchemes: {
          oauth: {
            type: 'oauth2',
            flows: {
              implicit: { scopes: { read: 'Read' } },
              authorizationCode: { scopes: { read: 'Read', write: 'Write' } },
            },
          },
        },
      },
    };
    expect(extractScopesFromSwagger(swagger)).toEqual(['read', 'write']);
  });

  it('skips non-oauth2 scheme types', () => {
    const swagger = {
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'X-API-Key', in: 'header' },
        },
      },
    };
    expect(extractScopesFromSwagger(swagger)).toEqual([]);
  });
});
