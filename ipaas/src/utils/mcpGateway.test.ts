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

import { describe, expect, it } from 'vitest';
import { aiGatewayAccessOf, aiGatewayNotice, mcpTransportUrlOf, mcpUrlOf } from './mcpGateway';

const coded = (status: number, code: string) => ({ status, code, body: JSON.stringify({ code }) });

describe('aiGatewayAccessOf', () => {
  it('reads the AI gateway binding from the security config', () => {
    expect(aiGatewayAccessOf({ mode: 'api-key', aiGateway: { deploymentStatus: 'Deployed' } }, null)).toEqual({ binding: { deploymentStatus: 'Deployed' } });
  });

  it('treats the not-published refusal as an AI gateway endpoint with no binding', () => {
    expect(aiGatewayAccessOf(undefined, coded(409, 'MCP_PROXY_NOT_PUBLISHED'))).toEqual({ binding: null });
  });

  it('leaves API Platform endpoints alone', () => {
    expect(aiGatewayAccessOf({ mode: 'api-key', publicUrl: 'https://apip.example.com/orders/v1.0' }, null)).toBeNull();
    expect(aiGatewayAccessOf(undefined, coded(409, 'API_NOT_EXPOSED'))).toBeNull();
    expect(aiGatewayAccessOf(undefined, coded(404, 'MCP_PROXY_NOT_PUBLISHED'))).toBeNull();
  });
});

describe('mcpUrlOf', () => {
  it('normalizes the AI gateway URL, which already ends in the MCP path', () => {
    expect(mcpUrlOf('https://gw.example.com/demo/orders-mcp/mcp/', { binding: { deploymentStatus: 'Deployed' } })).toBe('https://gw.example.com/demo/orders-mcp/mcp');
  });

  it('adds the MCP path under an API Platform URL', () => {
    expect(mcpUrlOf('https://apip.example.com/orders/v1.0/', null)).toBe('https://apip.example.com/orders/v1.0/mcp');
  });

  it('is empty without a gateway URL', () => {
    expect(mcpUrlOf('', null)).toBe('');
  });

  it('is empty for a malformed gateway URL', () => {
    expect(mcpUrlOf('not a URL', { binding: { deploymentStatus: 'Deployed' } })).toBe('');
  });

  it('preserves an existing query while adding the transport selector', () => {
    const mcpUrl = mcpUrlOf('https://gw.example.com/demo/orders-mcp/mcp/?route=blue', { binding: { deploymentStatus: 'Deployed' } });
    expect(mcpTransportUrlOf(mcpUrl).toString()).toBe('https://gw.example.com/demo/orders-mcp/mcp?route=blue&transportType=streamable-http');
  });
});

describe('aiGatewayNotice', () => {
  it.each([
    ['not published', { binding: null }, 'api-key' as const, 'info', /isn't published/],
    ['no gateway', { binding: { deploymentStatusReason: 'NO_GATEWAY' } }, 'api-key' as const, 'info', /no AI gateway/],
    ['deploying', { binding: { deploymentStatus: 'Deploying' as const } }, 'api-key' as const, 'info', /Publishing/],
    ['failed', { binding: { deploymentStatus: 'Failed' as const, deploymentStatusReason: 'CONTEXT_IN_USE' } }, 'none' as const, 'warning', /failed \(CONTEXT_IN_USE\)/],
    ['deployed with an api key', { binding: { deploymentStatus: 'Deployed' as const } }, 'api-key' as const, 'info', /only to the Agent Manager agents/],
  ])('%s', (_, access, mode, severity, text) => {
    const notice = aiGatewayNotice(access, mode);
    expect(notice?.severity).toBe(severity);
    expect(notice?.text).toMatch(text);
  });

  it('has nothing to say about a deployed, open MCP server', () => {
    expect(aiGatewayNotice({ binding: { deploymentStatus: 'Deployed' } }, 'none')).toBeNull();
  });
});
