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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { KEY_ACTIVATION_ATTEMPTS, KEY_ACTIVATION_DELAY_MS } from '../constants/mcp';
import { classifyMcpError, formatMcpError, formatToolResult, isMcpBlockedError, isMcpUnauthorizedError } from '../utils/mcp';
import type { JsonValue, McpConnectionStatus, McpErrorKind, McpHistoryEvent, McpHistoryEventType, McpPingResult, McpTool, McpToolResult } from '../types/mcp';

/** Per-request timeout, matching the playground library. */
const REQUEST_TIMEOUT_MS = 60_000;

interface UseMcpConnectionParams {
  /** The MCP endpoint (e.g. `${publicUrl}/mcp`). */
  url: string;
  /** Auth token sent in the `headerName` header. */
  token: string | null;
  /** Header carrying the token (e.g. `test-key`). */
  headerName: string;
}

export interface UseMcpConnectionResult {
  status: McpConnectionStatus;
  error: string | null;
  /** How the last connect failed, so the UI can name a cause the message cannot. */
  errorKind: McpErrorKind | null;
  serverCapabilities: ServerCapabilities | null;
  history: McpHistoryEvent[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  listTools: () => Promise<McpTool[]>;
  callTool: (name: string, args: Record<string, JsonValue>) => Promise<McpToolResult>;
  ping: () => Promise<McpPingResult>;
  clearHistory: () => void;
}

/**
 * A persistent MCP session over the SDK's StreamableHTTP transport: connect/disconnect,
 * list + invoke tools, ping, and an activity history — the data layer behind the MCP
 * playground. The connection targets the deployed data-plane endpoint (an external system),
 * so it lives in a hook that the playground drives imperatively rather than a React Query cache.
 */
export function useMcpConnection({ url, token, headerName }: UseMcpConnectionParams): UseMcpConnectionResult {
  const [status, setStatus] = useState<McpConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<McpErrorKind | null>(null);
  const [serverCapabilities, setServerCapabilities] = useState<ServerCapabilities | null>(null);
  const [history, setHistory] = useState<McpHistoryEvent[]>([]);
  const clientRef = useRef<Client | null>(null);
  // Bumped by every connect, disconnect and unmount: a retry loop runs for tens of seconds, so
  // an attempt checks it is still the current one before publishing a client or an error.
  const generationRef = useRef(0);

  const addHistoryEvent = useCallback((type: McpHistoryEventType, source: string, message: string, details?: unknown) => {
    setHistory((prev) => [{ type, timestamp: new Date().toISOString(), source, message, details }, ...prev]);
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  const disconnect = useCallback(async () => {
    generationRef.current += 1;
    const client = clientRef.current;
    clientRef.current = null;
    setStatus('disconnected');
    setServerCapabilities(null);
    if (client) {
      await client.close().catch(() => undefined);
      addHistoryEvent('info', 'disconnect', 'Disconnected from MCP server');
    }
  }, [addHistoryEvent]);

  const connect = useCallback(async () => {
    if (!url || !token) return;
    const generation = (generationRef.current += 1);
    const isStale = () => generation !== generationRef.current;
    await clientRef.current?.close().catch(() => undefined);
    clientRef.current = null;
    setStatus('connecting');
    setError(null);
    setErrorKind(null);

    for (let attempt = 1; ; attempt += 1) {
      let client: Client | null = null;
      try {
        const endpoint = new URL(url);
        if (!endpoint.searchParams.has('transportType')) endpoint.searchParams.set('transportType', 'streamable-http');
        const transport = new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { [headerName]: token } } });
        client = new Client({ name: 'ipaas-console-mcp-playground', version: '1.0.0' }, { capabilities: {} });
        await client.connect(transport);
        if (isStale()) {
          await client.close().catch(() => undefined);
          return;
        }
        clientRef.current = client;
        setServerCapabilities(client.getServerCapabilities() ?? null);
        setStatus('connected');
        addHistoryEvent('info', 'connect', 'Connected to MCP server', { url });
        return;
      } catch (err) {
        await client?.close().catch(() => undefined);
        if (isStale()) return;
        // Blocked counts as pending too: a 401 carrying no CORS headers reaches us as a network error.
        const pending = isMcpUnauthorizedError(err) || isMcpBlockedError(err);
        if (pending && attempt < KEY_ACTIVATION_ATTEMPTS) {
          if (attempt === 1) addHistoryEvent('info', 'connect', 'Test key not active on the gateway yet — retrying');
          await new Promise((resolve) => setTimeout(resolve, KEY_ACTIVATION_DELAY_MS));
          if (isStale()) return;
          continue;
        }
        const message = formatMcpError(err);
        setStatus('error');
        setError(message);
        setErrorKind(classifyMcpError(err));
        addHistoryEvent('error', 'connect', message);
        return;
      }
    }
  }, [url, token, headerName, addHistoryEvent]);

  const listTools = useCallback(async (): Promise<McpTool[]> => {
    const client = clientRef.current;
    if (!client) throw new Error('MCP client is not connected');
    addHistoryEvent('request', 'listTools', 'Listing tools');
    const response = await client.listTools(undefined, { timeout: REQUEST_TIMEOUT_MS });
    const tools = Array.isArray(response.tools) ? (response.tools as McpTool[]) : [];
    addHistoryEvent('response', 'listTools', `Received ${tools.length} tool(s)`);
    return tools;
  }, [addHistoryEvent]);

  const callTool = useCallback(
    async (name: string, args: Record<string, JsonValue>): Promise<McpToolResult> => {
      const client = clientRef.current;
      if (!client) throw new Error('MCP client is not connected');
      addHistoryEvent('request', name, `Calling tool "${name}"`, args);
      try {
        const raw = await client.callTool({ name, arguments: args }, undefined, { timeout: REQUEST_TIMEOUT_MS });
        const result = formatToolResult(raw);
        addHistoryEvent(result.isError ? 'error' : 'response', name, result.isError ? `Tool "${name}" returned an error` : `Tool "${name}" succeeded`, result);
        return result;
      } catch (err) {
        const message = formatMcpError(err);
        addHistoryEvent('error', name, message);
        return { content: [{ type: 'text', text: message }], isError: true };
      }
    },
    [addHistoryEvent],
  );

  const ping = useCallback(async (): Promise<McpPingResult> => {
    const client = clientRef.current;
    if (!client) throw new Error('MCP client is not connected');
    const start = Date.now();
    addHistoryEvent('request', 'ping', 'Pinging server');
    try {
      await client.ping({ timeout: REQUEST_TIMEOUT_MS });
      const latencyMs = Date.now() - start;
      addHistoryEvent('response', 'ping', `Pong in ${latencyMs}ms`);
      return { success: true, latencyMs };
    } catch (err) {
      const message = formatMcpError(err);
      addHistoryEvent('error', 'ping', message);
      return { success: false, latencyMs: Date.now() - start, error: message };
    }
  }, [addHistoryEvent]);

  // Close the live client if the hook unmounts while still connected, so the
  // transport doesn't leak. Runs on unmount only — no state changes here.
  useEffect(
    () => () => {
      generationRef.current += 1;
      void clientRef.current?.close().catch(() => undefined);
      clientRef.current = null;
    },
    [],
  );

  return { status, error, errorKind, serverCapabilities, history, connect, disconnect, listTools, callTool, ping, clearHistory };
}
