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

import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { JsonSchemaType, JsonValue, McpErrorKind, McpTool, McpToolContent, McpToolParameter, McpToolResult } from '../types/mcp';

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

/** What went wrong, at the granularity the UI can act on. */
export function classifyMcpError(error: unknown): McpErrorKind {
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
  const result = (raw ?? {}) as { content?: unknown; structuredContent?: unknown; isError?: boolean };
  const rawContent = Array.isArray(result.content) ? result.content : [];
  const content: McpToolContent[] = rawContent.map((item) => {
    if (item && typeof item === 'object') return item as McpToolContent;
    return { type: 'text', text: String(item) };
  });
  const structured = result.structuredContent;
  return { content, ...(structured !== undefined && structured !== null ? { structuredContent: structured as JsonValue } : {}), isError: result.isError ?? false };
}

/** Whether a text block only repeats the structured result as JSON, as servers do for older clients. */
export function repeatsStructuredContent(block: McpToolContent, structured: JsonValue | undefined): boolean {
  if (structured === undefined || block.type !== 'text' || typeof block.text !== 'string') return false;
  try {
    return JSON.stringify(JSON.parse(block.text)) === JSON.stringify(structured);
  } catch {
    return false;
  }
}

/**
 * What "Copy result" copies: exactly what is shown. The structured result alone when it is all
 * there is, the content blocks alone when there is no structured result, and both when a server
 * adds blocks beyond the structured result.
 */
export function copyableToolResult(structured: JsonValue | undefined, blocks: McpToolContent[]): JsonValue | McpToolContent[] | { structuredContent: JsonValue; content: McpToolContent[] } {
  if (structured === undefined) return blocks;
  return blocks.length > 0 ? { structuredContent: structured, content: blocks } : structured;
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
  if (/\b(401|403)\b|unauthor|forbidden/i.test(raw)) return 'Not authorized. Check the token and its permissions.';
  if (isMcpBlockedError(error)) return 'The browser blocked the response, so its status is unknown.';
  const cleaned = raw
    .replace(/^Streamable HTTP error:\s*/i, '')
    .replace(/Error POSTing to endpoint:\s*/i, '')
    .trim();
  return cleaned || 'Something went wrong while contacting the MCP server.';
}
