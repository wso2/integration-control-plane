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

import { useCallback, useEffect, useState } from 'react';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { KEY_ACTIVATION_ATTEMPTS, KEY_ACTIVATION_DELAY_MS } from '../constants/mcp';
import { isMcpBlockedError, isMcpForbiddenError, isMcpUnauthorizedError } from '../utils/mcp';
import type { McpTool } from '../types/mcp';

/** APIM gateways read the test key from this header; cloud uses the api-key-auth header. */
const DEFAULT_AUTH_HEADER = 'test-key';

interface UseMcpToolsParams {
  /** Deployed endpoint base URL — tools are listed from `${baseUrl}/mcp`. */
  baseUrl: string;
  /**
   * Credential for the server, or `null` when it needs none (an open endpoint).
   * `enabled` — not this field — gates a connection while a key is still pending.
   */
  apiKey: string | null;
  /** Request header the credential is presented in. Defaults to `test-key`. */
  authHeader?: string;
  /** Gate the connection until the endpoint + credential are ready. */
  enabled: boolean;
}

interface UseMcpToolsResult {
  tools: McpTool[];
  isLoading: boolean;
  error: string | null;
  /** 401/403 — a permissions issue, not a transient failure. */
  isForbidden: boolean;
  /** 401 only: the credential was rejected, so a fresh one can help — a 403 cannot. */
  isUnauthorized: boolean;
  refetch: () => void;
}

/**
 * Lists the tools a deployed MCP server exposes, over the MCP SDK's
 * StreamableHTTP transport (`${baseUrl}/mcp?transportType=streamable-http`,
 * credential in `authHeader`) — mirroring devant's `useMCPTools`. The connection
 * is to the deployed data-plane endpoint, not the console API, so this is an
 * external system: the connect/listTools lives in an effect, not in render.
 */
export function useMcpTools({ baseUrl, apiKey, authHeader = DEFAULT_AUTH_HEADER, enabled }: UseMcpToolsParams): UseMcpToolsResult {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    if (!enabled || !baseUrl) return undefined;
    let cancelled = false;

    const listOnce = async (): Promise<McpTool[]> => {
      const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl.replace(/\/+$/, '')}/mcp?transportType=streamable-http`), {
        requestInit: { headers: apiKey ? { [authHeader]: apiKey } : {} },
      });
      const client = new Client({ name: 'ipaas-console', version: '1.0.0' }, { capabilities: {} });
      try {
        await client.connect(transport);
        if (!client.getServerCapabilities()?.tools) throw new Error('MCP server does not support the tools capability');
        const response = await client.listTools();
        return Array.isArray(response.tools) ? (response.tools as McpTool[]) : [];
      } finally {
        client.close().catch(() => {});
      }
    };

    (async () => {
      setIsLoading(true);
      setError(null);
      setIsForbidden(false);
      setIsUnauthorized(false);

      for (let attempt = 1; !cancelled; attempt += 1) {
        try {
          const tools = await listOnce();
          if (!cancelled) setTools(tools);
          break;
        } catch (err) {
          if (cancelled) break;
          // Blocked counts as pending too: a 401 carrying no CORS headers reaches us as a network error.
          const pending = !!apiKey && (isMcpUnauthorizedError(err) || isMcpBlockedError(err));
          if (pending && attempt < KEY_ACTIVATION_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, KEY_ACTIVATION_DELAY_MS));
            continue;
          }
          setError(err instanceof Error ? err.message : 'Failed to load tools');
          if (isMcpForbiddenError(err)) setIsForbidden(true);
          if (isMcpUnauthorizedError(err)) setIsUnauthorized(true);
          break;
        }
      }
      if (!cancelled) setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, apiKey, authHeader, enabled, refetchTrigger]);

  const refetch = useCallback(() => setRefetchTrigger((t) => t + 1), []);
  return { tools, isLoading, error, isForbidden, isUnauthorized, refetch };
}
