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

/**
 * A tool exposed by a deployed MCP server, as returned by the MCP SDK's
 * `listTools()`. Shared by the MCP overview tools list (and, later, the
 * deferred MCP playground).
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

/** A single input parameter of an MCP tool, flattened from its input schema. */
export interface McpToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

// --- Playground: connection, history, tool results, and JSON-schema form values ---

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** `blocked` is a response the browser withheld (no CORS headers), so its status is unreadable. */
export type McpErrorKind = 'auth' | 'blocked' | 'other';

export type McpHistoryEventType = 'request' | 'response' | 'error' | 'info';

/** A single entry in the playground's activity log. */
export interface McpHistoryEvent {
  type: McpHistoryEventType;
  /** ISO timestamp. */
  timestamp: string;
  /** Where the event originated (e.g. the tool name or `connect`). */
  source: string;
  message: string;
  details?: unknown;
}

/** One content block of a tool-call result (text, or any other MCP content kind). */
export type McpToolContent = { type: 'text'; text: string } | { type: string; [key: string]: unknown };

/** Normalized result of a tool invocation. */
export interface McpToolResult {
  content: McpToolContent[];
  /** The tool's structured result, when it declares an output schema (MCP 2025-06-18+). */
  structuredContent?: JsonValue;
  isError?: boolean;
}

/** Any JSON value — the shape a tool's arguments take. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A (subset of) JSON Schema, as it appears in a tool's `inputSchema`. */
export interface JsonSchemaType {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaType>;
  items?: JsonSchemaType;
  required?: string[];
  enum?: unknown[];
  default?: JsonValue;
}

/** Latency + outcome of a playground `ping()`. */
export interface McpPingResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

/** A labelled single-select the playground sidebar renders (endpoint, visibility). */
export interface McpSwitcher {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}
