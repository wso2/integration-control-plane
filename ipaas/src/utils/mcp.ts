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

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import type { JsonSchemaType as SdkJsonSchema, JsonSchemaValidator, jsonSchemaValidator } from '@modelcontextprotocol/sdk/validation';
import type { JsonSchemaType, JsonValue, McpErrorKind, McpTool, McpToolContent, McpToolParameter, McpToolResult } from '../types/mcp';

// Keywords whose value is a subschema or a list of them, and keywords whose value maps names to subschemas.
const SUBSCHEMA_KEYWORDS = new Set(['additionalItems', 'additionalProperties', 'allOf', 'anyOf', 'contains', 'else', 'if', 'items', 'not', 'oneOf', 'prefixItems', 'propertyNames', 'then', 'unevaluatedItems', 'unevaluatedProperties']);
const SUBSCHEMA_MAP_KEYWORDS = new Set(['$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties', 'properties']);

/**
 * A copy of the schema where OpenAPI's `nullable: true` next to a `type` adds `'null'` to that type,
 * which is how Ajv reads it. Plain JSON Schema has no `nullable`.
 */
export function withNullableTypes(schema: unknown): unknown {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return schema;
  const entries = Object.entries(schema).map(([key, value]): [string, unknown] => {
    if (SUBSCHEMA_KEYWORDS.has(key)) return [key, Array.isArray(value) ? value.map(withNullableTypes) : withNullableTypes(value)];
    if (SUBSCHEMA_MAP_KEYWORDS.has(key) && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return [key, Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, withNullableTypes(sub)]))];
    }
    return [key, value];
  });
  const copy = Object.fromEntries(entries);
  if (copy.nullable === true && copy.type !== undefined) {
    const types: unknown[] = Array.isArray(copy.type) ? copy.type : [copy.type];
    if (!types.includes('null')) copy.type = [...types, 'null'];
  }
  return copy;
}

class NoEvalJsonSchemaValidator implements jsonSchemaValidator {
  private readonly inner = new CfWorkerJsonSchemaValidator();

  getValidator<T>(schema: SdkJsonSchema): JsonSchemaValidator<T> {
    return this.inner.getValidator<T>(withNullableTypes(schema) as SdkJsonSchema);
  }
}

/**
 * An MCP client that checks tool output schemas without eval. The SDK's default
 * validator, Ajv, compiles each schema with `new Function`, which the console's
 * Content-Security-Policy does not allow. CfWorker does not compile, and
 * `withNullableTypes` keeps Ajv's reading of OpenAPI `nullable`.
 */
export function createMcpClient(name: string): Client {
  return new Client({ name, version: '1.0.0' }, { capabilities: {}, jsonSchemaValidator: new NoEvalJsonSchemaValidator() });
}

/** Whether an MCP/transport error is a 401/403 — a permissions issue, not a transient failure. */
export function isMcpForbiddenError(error: unknown): boolean {
  if (error instanceof StreamableHTTPError) return error.code === 401 || error.code === 403;
  return /\b(401|403)\b|forbidden|unauthor/i.test(error instanceof Error ? error.message : String(error));
}

/** 401 only: the credential was rejected, so a fresh or newly-activated one can help — a 403 cannot. */
export function isMcpUnauthorizedError(error: unknown): boolean {
  if (error instanceof StreamableHTTPError) return error.code === 401;
  return /\b401\b|unauthor/i.test(error instanceof Error ? error.message : String(error));
}

/** A request the browser refused to hand over — a rejection without CORS headers reads as this, not as its status. */
export function isMcpBlockedError(error: unknown): boolean {
  if (error instanceof StreamableHTTPError) return false;
  const raw = error instanceof Error ? error.message : String(error);
  return /failed to fetch|load failed|networkerror|network error/i.test(raw);
}

export const MCP_REDIRECT_MESSAGE = "The MCP server answered with a redirect, which the console doesn't follow. Make the server answer at its MCP URL directly. A trailing-slash redirect is a common cause.";

/**
 * A 3xx the SDK's transport refused to follow. In browsers it follows none, so that the
 * API key header never reaches another origin; retrying or a new key cannot help.
 */
export function isMcpRedirectError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error);
  return /\bredirect\b.*\bnot followed\b/i.test(raw);
}

/** What went wrong, at the granularity the UI can act on. */
export function classifyMcpError(error: unknown): McpErrorKind {
  if (isMcpRedirectError(error)) return 'redirect';
  if (isMcpForbiddenError(error)) return 'auth';
  if (isMcpBlockedError(error)) return 'blocked';
  return 'other';
}

/** Flatten an MCP tool's input schema into a list of parameters for display. */
export function getMcpToolParameters(tool: McpTool): McpToolParameter[] {
  const props = tool.inputSchema?.properties;
  if (!props) return [];
  const required = tool.inputSchema?.required ?? [];
  return Object.entries(props).map(([name, schema]) => ({
    name,
    type: schema.type,
    description: schema.description ?? '',
    required: required.includes(name),
  }));
}

/** Primitive JSON-schema types that can be rendered as a single form field. */
const PRIMITIVE_TYPES = ['string', 'number', 'integer', 'boolean', 'null'];

/** Turn a schema property key into a human label (`max_tokens` / `maxTokens` → `Max Tokens`). */
export function formatFieldLabel(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Whether a schema is a flat object whose properties are all primitives (so it renders as a form). */
export function isSimpleObjectSchema(schema: JsonSchemaType): boolean {
  if (schema.type !== 'object' || !schema.properties) return false;
  return Object.values(schema.properties).every((prop) => PRIMITIVE_TYPES.includes(prop.type ?? ''));
}

/** A sensible default value for a schema, used to seed the argument form. */
export function generateDefaultValue(schema: JsonSchemaType): JsonValue {
  if (schema.default !== undefined) return schema.default;
  switch (schema.type) {
    case 'object': {
      const obj: { [key: string]: JsonValue } = {};
      for (const [key, prop] of Object.entries(schema.properties ?? {})) obj[key] = generateDefaultValue(prop);
      return obj;
    }
    case 'array':
      return [];
    case 'boolean':
      return false;
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    default:
      return null;
  }
}

/** Coerce a raw form input into the value expected by a schema field type. */
export function coerceFieldValue(type: string | undefined, raw: string | number | boolean): JsonValue {
  if (type === 'boolean') return typeof raw === 'boolean' ? raw : raw === 'true';
  if (type === 'number' || type === 'integer') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isNaN(n)) return null;
    return type === 'integer' ? Math.trunc(n) : n;
  }
  return typeof raw === 'string' ? raw : String(raw);
}

/** Normalize the MCP SDK's tool-call result into the playground's display shape. */
export function formatToolResult(raw: unknown): McpToolResult {
  const result = (raw ?? {}) as { content?: unknown; isError?: boolean };
  const rawContent = Array.isArray(result.content) ? result.content : [];
  const content: McpToolContent[] = rawContent.map((item) => {
    if (item && typeof item === 'object') return item as McpToolContent;
    return { type: 'text', text: String(item) };
  });
  return { content, isError: result.isError ?? false };
}

/** Friendly messages for the standard JSON-RPC error codes an MCP server can return. */
const RPC_ERROR_MESSAGES: Record<number, string> = {
  [-32700]: 'The server could not parse the request.',
  [-32600]: 'The server rejected the request as invalid.',
  [-32601]: 'The server does not support this operation.',
  [-32602]: 'One or more arguments are invalid for this operation.',
  [-32603]: 'The server encountered an internal error.',
};

/**
 * Turn a raw MCP/transport error into a user-friendly message: unwraps an embedded
 * JSON-RPC error (mapping known codes), recognises auth failures, and strips noisy
 * transport prefixes — falling back to a generic message.
 */
export function formatMcpError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const embedded = raw.match(/\{[\s\S]*\}/);
  if (embedded) {
    try {
      const parsed = JSON.parse(embedded[0]) as { error?: { code?: number; message?: string } };
      const rpc = parsed.error;
      if (rpc) {
        if (typeof rpc.code === 'number' && RPC_ERROR_MESSAGES[rpc.code]) return RPC_ERROR_MESSAGES[rpc.code];
        if (rpc.message) return rpc.message;
      }
    } catch {
      /* not JSON — fall through */
    }
  }
  if (isMcpRedirectError(error)) return MCP_REDIRECT_MESSAGE;
  if (/\b(401|403)\b|unauthor|forbidden/i.test(raw)) return 'Not authorized. Check the token and its permissions.';
  if (isMcpBlockedError(error)) return 'The browser blocked the response, so its status is unknown.';
  const cleaned = raw
    .replace(/^Streamable HTTP error:\s*/i, '')
    .replace(/Error POSTing to endpoint:\s*/i, '')
    .trim();
  return cleaned || 'Something went wrong while contacting the MCP server.';
}
