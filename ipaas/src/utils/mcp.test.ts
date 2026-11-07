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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { JsonSchemaType as SdkJsonSchema } from '@modelcontextprotocol/sdk/validation';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import {
  classifyMcpError,
  coerceFieldValue,
  createMcpClient,
  formatFieldLabel,
  formatMcpError,
  formatToolResult,
  generateDefaultValue,
  getMcpToolParameters,
  isMcpBlockedError,
  isMcpForbiddenError,
  isMcpRedirectError,
  isMcpUnauthorizedError,
  isSimpleObjectSchema,
  MCP_REDIRECT_MESSAGE,
  withNullableTypes,
} from './mcp';
import type { McpTool } from '../types/mcp';

describe('createMcpClient', () => {
  interface TestTool {
    outputSchema: { type: 'object'; properties: Record<string, object>; required?: string[] };
    structuredContent: Record<string, unknown>;
  }

  // One tool whose output schema and result the test can change between calls.
  async function connect(client: Client, tool: TestTool) {
    const server = new Server({ name: 'test-server', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'greet', inputSchema: { type: 'object' }, outputSchema: tool.outputSchema }] }));
    server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [], structuredContent: tool.structuredContent }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return () => Promise.all([client.close(), server.close()]);
  }

  // Stands in for a Content-Security-Policy without 'unsafe-eval'.
  async function withoutEval<T>(run: () => Promise<T>): Promise<T> {
    const original = globalThis.Function;
    globalThis.Function = function blockedFunction() {
      throw new EvalError('eval is blocked');
    } as unknown as FunctionConstructor;
    try {
      return await run();
    } finally {
      globalThis.Function = original;
    }
  }

  const greetingTool = (): TestTool => ({ outputSchema: { type: 'object', properties: { greeting: { type: 'string' } }, required: ['greeting'] }, structuredContent: { greeting: 'hi' } });
  // A schema the validator has not seen, so a compiling validator has to compile again.
  const countSchema: TestTool['outputSchema'] = { type: 'object', properties: { count: { type: 'integer', minimum: 0 } }, required: ['count'] };

  it('accepts structured content that matches the output schema and rejects content that does not', async () => {
    const client = createMcpClient('test');
    const tool = greetingTool();
    const close = await connect(client, tool);
    try {
      await client.listTools();
      await expect(client.callTool({ name: 'greet', arguments: {} })).resolves.toMatchObject({ structuredContent: { greeting: 'hi' } });
      tool.structuredContent = { greeting: 42 };
      await expect(client.callTool({ name: 'greet', arguments: {} })).rejects.toThrow(/does not match the tool's output schema/);
    } finally {
      await close();
    }
  });

  it('lists tools and checks their output where eval is blocked', async () => {
    const client = createMcpClient('test');
    const tool = greetingTool();
    const close = await connect(client, tool);
    try {
      // Warm the SDK's own message parsers first; only output-schema checking is under test.
      await client.listTools();
      await client.callTool({ name: 'greet', arguments: {} });
      tool.outputSchema = countSchema;
      tool.structuredContent = { count: 3 };
      await withoutEval(async () => {
        await expect(client.listTools()).resolves.toMatchObject({ tools: [{ name: 'greet' }] });
        await expect(client.callTool({ name: 'greet', arguments: {} })).resolves.toMatchObject({ structuredContent: { count: 3 } });
        tool.structuredContent = { count: -1 };
        await expect(client.callTool({ name: 'greet', arguments: {} })).rejects.toThrow(/does not match the tool's output schema/);
      });
    } finally {
      await close();
    }
  });

  it("the SDK's default client cannot list tools with an output schema where eval is blocked", async () => {
    const client = new Client({ name: 'test', version: '1.0.0' });
    const tool = greetingTool();
    const close = await connect(client, tool);
    try {
      await client.listTools();
      await client.callTool({ name: 'greet', arguments: {} });
      tool.outputSchema = countSchema;
      await withoutEval(async () => {
        await expect(client.listTools()).rejects.toThrow(/eval is blocked/);
      });
    } finally {
      await close();
    }
  });

  it('accepts null for an OpenAPI nullable field where eval is blocked, as the SDK default did', async () => {
    const client = createMcpClient('test');
    const tool = greetingTool();
    const close = await connect(client, tool);
    try {
      await client.listTools();
      await client.callTool({ name: 'greet', arguments: {} });
      tool.outputSchema = { type: 'object', properties: { nickname: { type: 'string', nullable: true } }, required: ['nickname'] };
      tool.structuredContent = { nickname: null };
      await withoutEval(async () => {
        await client.listTools();
        await expect(client.callTool({ name: 'greet', arguments: {} })).resolves.toMatchObject({ structuredContent: { nickname: null } });
        tool.structuredContent = { nickname: 7 };
        await expect(client.callTool({ name: 'greet', arguments: {} })).rejects.toThrow(/does not match the tool's output schema/);
      });
    } finally {
      await close();
    }
  });
});

describe('withNullableTypes', () => {
  const object = (properties: Record<string, object>, extra: object = {}): SdkJsonSchema => ({ type: 'object', properties, ...extra }) as SdkJsonSchema;

  // Each case is checked against Ajv, the validator the console used before.
  it.each<[string, SdkJsonSchema, unknown]>([
    ['a nullable string', object({ a: { type: 'string', nullable: true } }), { a: null }],
    ['a nullable string holding a string', object({ a: { type: 'string', nullable: true } }), { a: 'x' }],
    ['a nullable string holding a number', object({ a: { type: 'string', nullable: true } }), { a: 1 }],
    ['a string without nullable', object({ a: { type: 'string' } }), { a: null }],
    ['nullable: false', object({ a: { type: 'string', nullable: false } }), { a: null }],
    ['a nullable type list', object({ a: { type: ['string', 'integer'], nullable: true } }), { a: null }],
    ['a nullable enum without null', object({ a: { type: 'string', enum: ['x'], nullable: true } }), { a: null }],
    ['a nullable root', { type: 'object', nullable: true } as SdkJsonSchema, null],
    ['nullable array items', object({ a: { type: 'array', items: { type: 'integer', nullable: true } } }), { a: [1, null] }],
    ['a nullable anyOf branch', object({ a: { anyOf: [{ type: 'string', nullable: true }, { type: 'integer' }] } }), { a: null }],
    ['nullable additionalProperties', { type: 'object', additionalProperties: { type: 'number', nullable: true } } as SdkJsonSchema, { x: null }],
    ['a nullable $defs target', object({ a: { $ref: '#/$defs/S' } }, { $defs: { S: { type: 'object', nullable: true } } }), { a: null }],
    ['a nullable definitions target', object({ a: { $ref: '#/definitions/N' } }, { definitions: { N: { type: 'number', nullable: true } } }), { a: null }],
  ])('agrees with Ajv on %s', (_label, schema, data) => {
    // Separate copies: Ajv adds 'null' to a nullable type list in the schema it is given.
    const ajv = new AjvJsonSchemaValidator().getValidator(structuredClone(schema))(data).valid;
    const cfworker = new CfWorkerJsonSchemaValidator().getValidator(withNullableTypes(structuredClone(schema)) as SdkJsonSchema)(data).valid;
    expect(cfworker).toBe(ajv);
  });

  it('returns a copy and leaves enum, const and default values alone', () => {
    const schema = { type: 'object', nullable: true, properties: { a: { enum: [{ type: 'string', nullable: true }], const: { type: 'x', nullable: true }, default: { type: 'y', nullable: true } } } };
    const before = structuredClone(schema);
    const result = withNullableTypes(schema) as typeof schema & { type: string[] };
    expect(schema).toEqual(before);
    expect(result.type).toEqual(['object', 'null']);
    expect(result.properties.a).toEqual(before.properties.a);
  });
});

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
  it('explains a redirect the transport did not follow instead of the SDK wording', () => {
    const raw = "Error POSTing to endpoint: Redirect not followed: this runtime does not expose the redirect target (redirectPolicy: 'same-origin')";
    expect(formatMcpError(new StreamableHTTPError(0, raw))).toBe(MCP_REDIRECT_MESSAGE);
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

describe('isMcpRedirectError', () => {
  it('matches each way the transport reports a redirect it did not follow', () => {
    expect(isMcpRedirectError(new StreamableHTTPError(0, "Error POSTing to endpoint: Redirect not followed: this runtime does not expose the redirect target (redirectPolicy: 'same-origin')"))).toBe(true);
    expect(isMcpRedirectError(new StreamableHTTPError(307, "Error POSTing to endpoint: Redirect to https://other.example/mcp not followed (redirectPolicy: 'same-origin')"))).toBe(true);
    expect(isMcpRedirectError(new StreamableHTTPError(301, 'Failed to open SSE stream: Redirect to plain http not followed; try https://gw.example/mcp instead'))).toBe(true);
  });
  it('is false for other failures', () => {
    expect(isMcpRedirectError(new StreamableHTTPError(401, 'nope'))).toBe(false);
    expect(isMcpRedirectError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isMcpRedirectError(new Error('connection refused'))).toBe(false);
  });
  it('recognises the SDK transport refusing a redirect to another origin', async () => {
    const redirectingFetch = async () => new Response(null, { status: 307, headers: { location: 'https://elsewhere.example/mcp' } });
    const transport = new StreamableHTTPClientTransport(new URL('https://gateway.example/mcp'), { fetch: redirectingFetch });
    const error = await createMcpClient('test')
      .connect(transport)
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(classifyMcpError(error)).toBe('redirect');
    expect(formatMcpError(error)).toBe(MCP_REDIRECT_MESSAGE);
  });
});

describe('classifyMcpError', () => {
  it('separates auth, blocked, redirect and everything else', () => {
    expect(classifyMcpError(new StreamableHTTPError(401, 'nope'))).toBe('auth');
    expect(classifyMcpError(new TypeError('Failed to fetch'))).toBe('blocked');
    expect(classifyMcpError(new StreamableHTTPError(0, 'Error POSTing to endpoint: Redirect not followed: this runtime does not expose the redirect target'))).toBe('redirect');
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
