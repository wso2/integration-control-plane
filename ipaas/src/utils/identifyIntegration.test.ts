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
import { identifyIntegration } from './identifyIntegration';
import type { IntegrationType, IntegrationRuntime } from '../types/integration';

describe('identifyIntegration', () => {
  describe('componentSubType-first rules (override displayType)', () => {
    it.each([
      ['tailscale', 'restAPI', 'tailscale-vpn', 'unknown'],
      ['ballerinaFileIntegration', 'ballerinaService', 'file-integration', 'ballerina'],
      ['miFileIntegration', 'miApiService', 'file-integration', 'mi'],
      ['ballerinaEventHandler', 'ballerinaService', 'event-integration', 'ballerina'],
      ['miEventHandler', 'miApiService', 'event-integration', 'mi'],
      ['aiAgent', 'ballerinaService', 'ai-agent', 'ballerina'],
    ] satisfies [string, string, IntegrationType, IntegrationRuntime][])('componentSubType=%s wins over displayType=%s -> %s/%s', (componentSubType, displayType, type, runtime) => {
      const identity = identifyIntegration(displayType, componentSubType);
      expect(identity.type).toBe(type);
      expect(identity.runtime).toBe(runtime);
    });

    it.each([
      ['proxy', 'mcp-proxy', 'unknown'],
      ['gitProxy', 'mcp-proxy', 'unknown'],
      ['ballerinaService', 'mcp-server', 'ballerina'],
      ['miApiService', 'mcp-server', 'mi'],
      ['restAPI', 'mcp-server', 'unknown'],
    ] satisfies [string, IntegrationType, IntegrationRuntime][])('componentSubType=MCP with displayType=%s -> %s/%s', (displayType, type, runtime) => {
      const identity = identifyIntegration(displayType, 'MCP');
      expect(identity.type).toBe(type);
      expect(identity.runtime).toBe(runtime);
    });

    it.each([
      ['ballerinaService', 'ballerina'],
      ['miApiService', 'mi'],
      ['restAPI', 'unknown'],
    ] satisfies [string, IntegrationRuntime][])('componentSubType=webhook with displayType=%s -> webhook/%s', (displayType, runtime) => {
      const identity = identifyIntegration(displayType, 'webhook');
      expect(identity.type).toBe('webhook');
      expect(identity.runtime).toBe(runtime);
    });
  });

  describe('displayType fallback (componentSubType is null)', () => {
    it.each([
      ['webhook', 'unknown'],
      ['ballerinaWebhook', 'ballerina'],
      ['miWebhook', 'mi'],
      ['byocWebhook', 'unknown'],
      ['buildpackWebhook', 'unknown'],
    ] satisfies [string, IntegrationRuntime][])('standalone webhook displayType=%s -> webhook/%s', (displayType, runtime) => {
      const identity = identifyIntegration(displayType, null);
      expect(identity.type).toBe('webhook');
      expect(identity.runtime).toBe(runtime);
    });

    it.each([
      ['ballerinaService', 'integration-as-api', 'ballerina'],
      ['restApi', 'integration-as-api', 'ballerina'],
      ['miApiService', 'integration-as-api', 'mi'],
      ['miRestApi', 'integration-as-api', 'mi'],
      ['scheduledTask', 'automation', 'ballerina'],
      ['miCronjob', 'automation', 'mi'],
      ['ballerinaEventHandler', 'event-integration', 'ballerina'],
      ['miEventHandler', 'event-integration', 'mi'],
      ['somethingUnrecognized', 'unsupported', 'unknown'],
      ['', 'unsupported', 'unknown'],
    ] satisfies [string, IntegrationType, IntegrationRuntime][])('displayType=%s -> %s/%s', (displayType, type, runtime) => {
      const identity = identifyIntegration(displayType, null);
      expect(identity.type).toBe(type);
      expect(identity.runtime).toBe(runtime);
    });
  });

  it('preserves the original displayType/componentSubType pair on raw', () => {
    const identity = identifyIntegration('ballerinaService', 'webhook');
    expect(identity.raw).toEqual({ displayType: 'ballerinaService', componentSubType: 'webhook' });
  });
});
