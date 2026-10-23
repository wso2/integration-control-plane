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

import { Alert, Avatar, Box, Button, CircularProgress, IconButton, InputBase, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, Copy, Send, Sparkles, User } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApiDefinition, useEnvEndpoints } from '../hooks/useDeployments';
import { useEndpointTestAccess } from '../hooks/useEndpointTestAccess';
import { generateUUID } from '../utils/string';
import type { AgentConnectionStatus, ChatMessage } from '../types/agentChat';
import type { EndpointRef } from '../types/consumers';

interface AgentChatProps {
  projectId: string;
  componentId: string;
  versionId: string;
  /** The deployment's release id for the selected environment. */
  releaseId: string;
  /**
   * Environment name. Endpoint security is addressed by the
   * component/environment/endpoint triple, so chat cannot authenticate without it.
   */
  environmentName?: string;
  /** Critical (production) envs cannot be chatted with — see devant parity. */
  envCritical: boolean;
  /** Disable input while the env is still waiting on configuration. */
  waitForConfig?: boolean;
  /** `'page'` fills available height (Test page); `'card'` is compact (env card). */
  variant?: 'card' | 'page';
  /** Reports endpoint-discovery + auth readiness so the host can show a chip. */
  onConnectionChange?: (status: AgentConnectionStatus) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AgentChat({ projectId, componentId, versionId, releaseId, environmentName, envCritical, waitForConfig = false, variant = 'card', onConnectionChange }: AgentChatProps): ReactNode {
  const { data: endpoints = [] } = useEnvEndpoints(componentId, versionId, releaseId);

  // Candidate chat endpoint: the first reachable one. (The `/chat` operation is
  // confirmed below only as a hint; the endpoint is still used when its operations
  // aren't discoverable.)
  const candidate = useMemo(() => endpoints.find((e) => e.publicUrl) ?? null, [endpoints]);

  // The enforcing gateway URL, active auth mode and a short-lived test key, from the
  // same BFF routes the swagger console and the API security drawer use.
  const accessRef: EndpointRef | null = useMemo(() => (candidate && environmentName ? { projectName: projectId, componentName: componentId, environmentName, endpointName: candidate.id } : null), [projectId, componentId, environmentName, candidate]);
  const access = useEndpointTestAccess(accessRef, !!accessRef);

  // The endpoint's base64 OpenAPI arrives in `apimRevisionId`, so the operations come from the spec.
  const { data: chatSpec } = useApiDefinition(candidate?.apimRevisionId);
  const hasChatOperation = !!(chatSpec as { paths?: Record<string, unknown> } | null)?.paths?.['/chat'];
  // An agent publishes no OpenAPI spec, so a missing `/chat` is unknown rather than absent.
  const operationsKnown = !!chatSpec;

  // Chat invokes the apip gateway and nothing else. The endpoint's own external
  // route is open (the policy engine is not in its path), so falling back to it
  // would hand the test key to a host that never validates it and would make an
  // unenforced call look like a secured one.
  const chatUrl = access.gatewayUrl;

  const apiKey = access.apiKey;
  const authHeader = access.authHeader;
  const authError = !!access.keyError;
  // A `none`-mode endpoint is open and needs no credential at all.
  const isAuthorized = access.isAuthorized;
  // jwt-secured endpoints are not auto-minted — the test-key route would flip
  // enforcement to api-key auth, which must be a deliberate choice.
  const needsManualKey = access.mode === 'jwt' && !access.apiKey;

  // Connection status, reported up to the host (Test page shows it as a chip). An
  // unreachable endpoint is terminal, so it reports `error` rather than spinning on
  // `connecting` forever.
  const connectionStatus: AgentConnectionStatus = authError || access.isUnavailable ? 'error' : isAuthorized && chatUrl ? 'connected' : 'connecting';
  useEffect(() => {
    onConnectionChange?.(connectionStatus);
  }, [connectionStatus, onConnectionChange]);

  const sessionId = useMemo(() => generateUUID(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, isSending]);

  const canSend = isAuthorized && !!chatUrl && !isSending && !waitForConfig;

  const pushMessage = (role: ChatMessage['role'], content: string) => setMessages((prev) => [...prev, { role, content, time: Date.now() }]);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard?.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
  };

  const send = async (message: string, allowKeyRefresh = true, keyOverride?: string | null): Promise<void> => {
    const key = keyOverride ?? apiKey;
    // An open (`none`-mode) endpoint is called without a credential.
    if (!chatUrl || (!key && !isAuthorized)) return;
    setChatError(null);
    setIsSending(true);
    try {
      const response = await fetch(`${chatUrl}/chat`, {
        method: 'POST',
        headers: { ...(key ? { [authHeader]: key } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      });

      // Only re-mint where a key is what the endpoint expects. On a `none` or `jwt`
      // endpoint a 401 is not a stale key, and minting would silently switch
      // enforcement to api-key auth — that stays an explicit user action.
      const canRefreshKey = access.mode === 'api-key';
      if (response.status === 401 && allowKeyRefresh && canRefreshKey) {
        // Key likely expired — regenerate once and retry with the fresh key
        // passed directly; a setApiKey state update wouldn't reach this
        // closure in time. If we can't refresh, fall through to surface the 401.
        const fresh = await access.mintKey();
        if (fresh) {
          await send(message, false, fresh);
          return;
        }
      }
      if (!response.ok) {
        setChatError(`HTTP ${response.status} ${response.statusText}`);
        return;
      }

      const body = await response.text();
      let assistant = body;
      try {
        assistant = JSON.parse(body).message ?? body;
      } catch {
        /* plain-text response */
      }
      pushMessage('assistant', assistant);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setChatError(msg.includes('Failed to fetch') ? 'Agent is inactive. Please try again.' : `Failed to connect: ${msg}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = () => {
    const message = input.trim();
    if (!message || !canSend) return;
    setInput('');
    pushMessage('user', message);
    send(message);
  };

  // Critical (production) environments: chat is intentionally unavailable.
  if (envCritical) {
    return <Alert severity="info">AI agent chat isn&apos;t available in production environments. Test your agent in a non-critical environment such as Development.</Alert>;
  }

  // A reachable endpoint exists, but it is not fronted by the API Platform gateway —
  // the only URL chat may invoke — so name that cause instead of the generic
  // "no endpoint", which would send the user looking in the wrong place.
  const notExposed = !!candidate && access.isUnavailable;
  const noEndpoint = endpoints.length > 0 && !chatUrl && !notExposed;
  // Passes the gateway's own reason through rather than replacing it with a generic line.
  const authNotice = `Chat can’t authenticate with this agent: issuing a test key failed.${access.keyError ? ` ${access.keyError}` : ''}`;
  const isPage = variant === 'page';

  return (
    <Stack gap={1.5} sx={{ minHeight: 0, width: '100%' }}>
      {chatError && (
        <Alert severity="error" onClose={() => setChatError(null)}>
          {chatError}
        </Alert>
      )}
      {authError && <Alert severity="warning">{authNotice}</Alert>}
      {noEndpoint && <Alert severity="info">No chat endpoint found for this agent.</Alert>}
      {notExposed && <Alert severity="info">This agent can&apos;t be chat-tested right now &mdash; its endpoint hasn&apos;t registered on the API gateway. Redeploy the agent, or check that its endpoint is exposed as an API.</Alert>}
      {needsManualKey && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={() => void access.mintKey()} disabled={access.isMinting}>
              Use a test key
            </Button>
          }>
          This agent is secured with OAuth. Chatting here needs a test key, which switches the endpoint to API Key authentication.
        </Alert>
      )}
      {isPage && operationsKnown && !noEndpoint && !hasChatOperation && chatUrl && messages.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          No <code>/chat</code> operation was detected on this agent — messages are sent to <code>{chatUrl}/chat</code>.
        </Typography>
      )}

      <Box
        ref={threadRef}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          minHeight: isPage ? 280 : 180,
          maxHeight: isPage ? 560 : 360,
          overflowY: 'auto',
          p: 4,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}>
        {messages.length === 0 && !isSending && (
          <Stack alignItems="center" justifyContent="center" gap={1} sx={{ flex: 1, py: 4 }}>
            <Sparkles size={24} style={{ opacity: 0.4 }} />
            <Typography variant="body2" color="text.secondary">
              Send a message to start chatting with your agent.
            </Typography>
          </Stack>
        )}

        {messages.map((m, idx) =>
          m.role === 'user' ? (
            // User: right-aligned grey bubble, avatar on the far right.
            <Stack key={`${sessionId}-${idx}`} direction="row" justifyContent="flex-end" gap={1.25} sx={{ alignItems: 'flex-start' }}>
              <Stack alignItems="flex-end" gap={0.5} sx={{ maxWidth: '80%' }}>
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <Typography variant="caption" color="text.secondary">
                    {formatTime(m.time)}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    You
                  </Typography>
                </Stack>
                <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover', borderRadius: 2, borderTopRightRadius: 4 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.content}
                  </Typography>
                </Box>
              </Stack>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'action.hover', color: 'text.secondary' }}>
                <User size={16} />
              </Avatar>
            </Stack>
          ) : (
            // Agent: left-aligned bordered bubble + copy action, avatar on the left.
            <Stack key={`${sessionId}-${idx}`} direction="row" gap={1.25} sx={{ alignItems: 'flex-start' }}>
              <Avatar sx={{ width: 32, height: 32, color: 'primary.main', bgcolor: (theme) => `${theme.palette.primary.main}1f` }}>
                <Sparkles size={16} />
              </Avatar>
              <Stack gap={0.5} sx={{ maxWidth: '80%' }}>
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                    Agent
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatTime(m.time)}
                  </Typography>
                </Stack>
                <Box sx={{ px: 2, py: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2, borderTopLeftRadius: 4 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.content}
                  </Typography>
                </Box>
                <Tooltip title={copiedIdx === idx ? 'Copied' : 'Copy'}>
                  <IconButton size="small" onClick={() => handleCopy(m.content, idx)} sx={{ alignSelf: 'flex-start', color: 'text.secondary' }} aria-label="Copy message">
                    {copiedIdx === idx ? <Check size={14} /> : <Copy size={14} />}
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          ),
        )}

        {isSending && (
          <Stack direction="row" gap={1.25} sx={{ alignItems: 'flex-start' }}>
            <Avatar sx={{ width: 32, height: 32, color: 'primary.main', bgcolor: (theme) => `${theme.palette.primary.main}1f` }}>
              <Sparkles size={16} />
            </Avatar>
            <Stack direction="row" gap={1} alignItems="center" sx={{ py: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">
                Agent is thinking...
              </Typography>
            </Stack>
          </Stack>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2, pr: 0.75, py: 0.75, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
        <InputBase
          fullWidth
          multiline
          maxRows={4}
          placeholder={access.isMinting && !apiKey ? 'Authenticating…' : 'Message your agent…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={!canSend && !input}
          sx={{ flex: 1, fontSize: 14 }}
        />
        <Button variant="contained" startIcon={<Send size={16} />} onClick={handleSend} disabled={!canSend || !input.trim()} sx={{ borderRadius: 2, px: 2, flexShrink: 0 }}>
          Send
        </Button>
      </Box>
    </Stack>
  );
}
