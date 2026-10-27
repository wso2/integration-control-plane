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
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  classifyMcpError,
  coerceFieldValue,
  formatFieldLabel,
  formatMcpError,
  formatToolResult,
  generateDefaultValue,
  getMcpToolParameters,
  isMcpBlockedError,
  isMcpForbiddenError,
  isMcpUnauthorizedError,
  isSimpleObjectSchema,
  copyableToolResult,
  repeatsStructuredContent,
} from './mcp';
import type { McpTool } from '../types/mcp';

describe('getMcpToolParameters', () => {
  it('flattens the input schema and marks required params', () => {
    const tool: McpTool = {
      name: 'greet',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'who' }, loud: { type: 'boolean' } }, required: ['name'] },
    };
    expect(getMcpToolParameters(tool)).toEqual([
      { name: 'name', type: 'string', description: 'who', required: true },
      { name: 'loud', type: 'boolean', description: '', required: false },
    ]);
  });
  it('returns [] when there is no schema', () => {
    expect(getMcpToolParameters({ name: 'x' })).toEqual([]);
  });
});

describe('formatFieldLabel', () => {
  it('humanizes snake_case, kebab-case and camelCase keys', () => {
    expect(formatFieldLabel('max_tokens')).toBe('Max Tokens');
    expect(formatFieldLabel('api-key')).toBe('Api Key');
    expect(formatFieldLabel('maxTokens')).toBe('Max Tokens');
    expect(formatFieldLabel('url')).toBe('Url');
  });
});

describe('isSimpleObjectSchema', () => {
  it('is true for a flat object of primitives', () => {
    expect(isSimpleObjectSchema({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } } })).toBe(true);
  });
  it('is false when a property is an object or array', () => {
    expect(isSimpleObjectSchema({ type: 'object', properties: { a: { type: 'object' } } })).toBe(false);
    expect(isSimpleObjectSchema({ type: 'object', properties: { a: { type: 'array' } } })).toBe(false);
  });
  it('is false when the schema is not an object', () => {
    expect(isSimpleObjectSchema({ type: 'string' })).toBe(false);
  });
});

describe('generateDefaultValue', () => {
  it('uses the schema default when present', () => {
    expect(generateDefaultValue({ type: 'string', default: 'hi' })).toBe('hi');
  });
  it('derives defaults by type', () => {
    expect(generateDefaultValue({ type: 'string' })).toBe('');
    expect(generateDefaultValue({ type: 'number' })).toBe(0);
    expect(generateDefaultValue({ type: 'boolean' })).toBe(false);
    expect(generateDefaultValue({ type: 'array' })).toEqual([]);
    expect(generateDefaultValue({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'boolean' } } })).toEqual({ a: '', b: false });
  });
});

describe('coerceFieldValue', () => {
  it('coerces by field type', () => {
    expect(coerceFieldValue('number', '42')).toBe(42);
    expect(coerceFieldValue('integer', '42.9')).toBe(42);
    expect(coerceFieldValue('boolean', 'true')).toBe(true);
    expect(coerceFieldValue('boolean', false)).toBe(false);
    expect(coerceFieldValue('string', 7)).toBe('7');
  });
  it('returns null for an unparseable number', () => {
    expect(coerceFieldValue('number', 'abc')).toBeNull();
  });
});

describe('formatToolResult', () => {
  it('passes through object content and flags errors', () => {
    const result = formatToolResult({ content: [{ type: 'text', text: 'ok' }], isError: true });
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }], isError: true });
  });
  it('wraps non-object content as text and defaults isError to false', () => {
    expect(formatToolResult({ content: ['plain'] })).toEqual({ content: [{ type: 'text', text: 'plain' }], isError: false });
  });
  it('is safe on missing/empty content', () => {
    expect(formatToolResult(null)).toEqual({ content: [], isError: false });
    expect(formatToolResult({})).toEqual({ content: [], isError: false });
  });
  it('keeps the structured result', () => {
    const raw = { content: [{ type: 'text', text: '{"state": "completed"}' }], structuredContent: { state: 'completed' } };
    expect(formatToolResult(raw).structuredContent).toEqual({ state: 'completed' });
    expect(formatToolResult({ content: [], structuredContent: null })).not.toHaveProperty('structuredContent');
  });
});

describe('repeatsStructuredContent', () => {
  it('recognizes a text block that only repeats the structured result', () => {
    const structured = { state: 'completed', evidence: [] };
    expect(repeatsStructuredContent({ type: 'text', text: '{"state": "completed", "evidence": []}' }, structured)).toBe(true);
    expect(repeatsStructuredContent({ type: 'text', text: 'access_denied: not available' }, structured)).toBe(false);
    expect(repeatsStructuredContent({ type: 'text', text: '{"state": "completed"}' }, undefined)).toBe(false);
  });
});

describe('copyableToolResult', () => {
  it('copies exactly what the result shows', () => {
    const structured = { state: 'completed' };
    const note = { type: 'text', text: 'Results are truncated.' } as const;
    expect(copyableToolResult(structured, [])).toEqual(structured);
    expect(copyableToolResult(undefined, [note])).toEqual([note]);
    // Blocks a server adds beyond the structured result are not dropped from the copy.
    expect(copyableToolResult(structured, [note])).toEqual({ structuredContent: structured, content: [note] });
  });
});

describe('formatMcpError', () => {
  it('maps embedded JSON-RPC error codes to friendly text', () => {
    const raw = 'Streamable HTTP error: Error POSTing to endpoint: {"jsonrpc":"2.0","id":3,"error":{"code":-32601,"message":"Method not found"}}';
    expect(formatMcpError(new Error(raw))).toBe('The server does not support this operation.');
    expect(formatMcpError('{"error":{"code":-32602,"message":"bad"}}')).toBe('One or more arguments are invalid for this operation.');
  });
  it('uses the JSON-RPC message when the code is unknown', () => {
    expect(formatMcpError('{"error":{"code":-40000,"message":"Custom failure"}}')).toBe('Custom failure');
  });
  it('recognises auth failures', () => {
    expect(formatMcpError(new Error('HTTP 403: forbidden'))).toBe('Not authorized. Check the token and its permissions.');
  });
  it('reports a withheld response rather than the browser wording', () => {
    expect(formatMcpError(new TypeError('Failed to fetch'))).toBe('The browser blocked the response, so its status is unknown.');
  });
  it('strips transport prefixes and falls back to a generic message', () => {
    expect(formatMcpError('Streamable HTTP error: connection refused')).toBe('connection refused');
    expect(formatMcpError('')).toBe('Something went wrong while contacting the MCP server.');
  });
});

describe('isMcpForbiddenError', () => {
  it('uses the transport error status code when available', () => {
    expect(isMcpForbiddenError(new StreamableHTTPError(403, 'nope'))).toBe(true);
    expect(isMcpForbiddenError(new StreamableHTTPError(401, 'nope'))).toBe(true);
    expect(isMcpForbiddenError(new StreamableHTTPError(500, 'boom'))).toBe(false);
  });
  it('falls back to message matching for untyped errors', () => {
    expect(isMcpForbiddenError(new Error('HTTP 403 forbidden'))).toBe(true);
    expect(isMcpForbiddenError('unauthorized')).toBe(true);
    expect(isMcpForbiddenError(new Error('connection refused'))).toBe(false);
  });
});

describe('isMcpBlockedError', () => {
  it('matches the browser wording for a request it would not hand over', () => {
    expect(isMcpBlockedError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isMcpBlockedError(new Error('Load failed'))).toBe(true);
  });
  it('is false for a readable transport status', () => {
    expect(isMcpBlockedError(new StreamableHTTPError(401, 'nope'))).toBe(false);
    expect(isMcpBlockedError(new Error('connection refused'))).toBe(false);
  });
});

describe('classifyMcpError', () => {
  it('separates auth, blocked and everything else', () => {
    expect(classifyMcpError(new StreamableHTTPError(401, 'nope'))).toBe('auth');
    expect(classifyMcpError(new TypeError('Failed to fetch'))).toBe('blocked');
    expect(classifyMcpError(new Error('connection refused'))).toBe('other');
  });
});

describe('isMcpUnauthorizedError', () => {
  it('is 401 only, so a 403 is not treated as a credential problem', () => {
    expect(isMcpUnauthorizedError(new StreamableHTTPError(401, 'nope'))).toBe(true);
    expect(isMcpUnauthorizedError(new StreamableHTTPError(403, 'nope'))).toBe(false);
    expect(isMcpUnauthorizedError(new Error('HTTP 403: forbidden'))).toBe(false);
    expect(isMcpUnauthorizedError(new Error('unauthorized'))).toBe(true);
  });
});
