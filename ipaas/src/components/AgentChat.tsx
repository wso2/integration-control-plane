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
import { IS_CLOUD } from '../features';
import { useApiDefinition, useEnvEndpoints } from '../hooks/useDeployments';
import { useApimApi, useGenerateTestKey } from '../hooks/useApim';
import { useEndpointTestAccess } from '../hooks/useEndpointTestAccess';
import { generateUUID } from '../utils/string';
import type { AgentConnectionStatus, ChatMessage } from '../types/agentChat';
import type { EndpointRef } from '../types/consumers';

/** Header the APIM gateway reads the test key from. Cloud uses the api-key-auth header instead. */
const APIM_TEST_KEY_HEADER = 'test-key';

interface AgentChatProps {
  componentId: string;
  versionId: string;
  /** The deployment's release id for the selected environment. */
  releaseId: string;
  /**
   * Environment name. Cloud addresses endpoint security by the
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

export default function AgentChat({ componentId, versionId, releaseId, environmentName, envCritical, waitForConfig = false, variant = 'card', onConnectionChange }: AgentChatProps): ReactNode {
  const { data: endpoints = [] } = useEnvEndpoints(componentId, versionId, releaseId);

  // Candidate chat endpoint: the first reachable one. On the APIM products it must
  // ALSO carry an APIM id, since the test key is minted per APIM API. Cloud has no
  // APIM — an agent's key comes from agent-manager — so requiring one there would
  // reject every endpoint. The `/chat` operation below is a hint, not a filter.
  const candidate = useMemo(() => endpoints.find((e) => e.publicUrl && (IS_CLOUD || e.apimId)) ?? null, [endpoints]);
  const apimId = candidate?.apimId ?? null;

  // Cloud: the enforcing gateway URL, active auth mode and a short-lived test key,
  // from the same BFF routes the swagger console and the API security drawer use.
  const accessRef: EndpointRef | null = useMemo(() => (IS_CLOUD && candidate && environmentName ? { componentName: componentId, environmentName, endpointName: candidate.id } : null), [componentId, environmentName, candidate]);
  const access = useEndpointTestAccess(accessRef, IS_CLOUD && !!accessRef);

  const { data: apimApi } = useApimApi(IS_CLOUD ? null : apimId);
  // Cloud carries the endpoint's base64 OpenAPI in `apimRevisionId`, so the
  // operations come from the spec rather than from an APIM API record.
  const { data: chatSpec } = useApiDefinition(IS_CLOUD ? candidate?.apimRevisionId : null);
  const hasChatOperation = IS_CLOUD ? !!(chatSpec as { paths?: Record<string, unknown> } | null)?.paths?.['/chat'] : (apimApi?.operations?.some((op) => op.target === '/chat') ?? false);

  // Cloud invokes the gateway URL and nothing else. Falling back to an unenforced
  // route would hand the test key to a host that never validates it, making an
  // open call look secured.
  const chatUrl = IS_CLOUD ? access.gatewayUrl : (candidate?.publicUrl ?? '');

  const generateKey = useGenerateTestKey();
  const [apimKey, setApimKey] = useState<string | null>(null);
  const [apimAuthError, setApimAuthError] = useState(false);
  const fetchTestKey = useMemo(
    () => async (): Promise<string | null> => {
      if (!apimId) return null;
      setApimAuthError(false);
      try {
        const result = await generateKey.mutateAsync({ apimId, keyType: envCritical ? 'Production' : 'Development' });
        const key = result?.apikey ?? null;
        setApimKey(key);
        if (!key) setApimAuthError(true);
        return key;
      } catch {
        setApimAuthError(true);
        return null;
      }
    },
    // generateKey is a stable mutation object; apimId/envCritical drive identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apimId, envCritical],
  );

  useEffect(() => {
    if (!IS_CLOUD && apimId) fetchTestKey();
  }, [apimId, fetchTestKey]);

  // The credential + how to present it, per product.
  const apiKey = IS_CLOUD ? access.apiKey : apimKey;
  const authHeader = IS_CLOUD ? access.authHeader : APIM_TEST_KEY_HEADER;
  const authError = IS_CLOUD ? !!access.keyError : apimAuthError;
  // Cloud: a `none`-mode endpoint is open and needs no credential at all.
  const isAuthorized = IS_CLOUD ? access.isAuthorized : !!apimKey;
  const refreshKey = IS_CLOUD ? access.mintKey : fetchTestKey;
  // jwt-secured endpoints are not auto-minted — the test-key route would flip
  // enforcement to api-key auth, which must be a deliberate choice.
  const needsManualKey = IS_CLOUD && access.mode === 'jwt' && !access.apiKey;

  // Connection status, reported up to the host (Test page shows it as a chip). An
  // unreachable endpoint is terminal, so it reports `error` rather than spinning on
  // `connecting` forever.
  const connectionStatus: AgentConnectionStatus = authError || (IS_CLOUD && access.isUnavailable) ? 'error' : isAuthorized && chatUrl ? 'connected' : 'connecting';
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
    // An open (cloud `none`-mode) endpoint is called without a credential.
    if (!chatUrl || (!key && !isAuthorized)) return;
    setChatError(null);
    setIsSending(true);
    try {
      const response = await fetch(`${chatUrl}/chat`, {
        method: 'POST',
        headers: { ...(key ? { [authHeader]: key } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      });

      // Only re-mint where a key is what the endpoint expects. On a cloud `none` or
      // `jwt` endpoint a 401 is not a stale key, and minting would silently switch
      // enforcement to api-key auth — that stays an explicit user action.
      const canRefreshKey = IS_CLOUD ? access.mode === 'api-key' : !!apimId;
      if (response.status === 401 && allowKeyRefresh && canRefreshKey) {
        // Key likely expired — regenerate once and retry with the fresh key
        // passed directly; a setApiKey state update wouldn't reach this
        // closure in time. If we can't refresh, fall through to surface the 401.
        const fresh = await refreshKey();
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

  // An agent is fronted by the AI gateway, which agent-manager registers from the
  // agent's own configuration. It is never exposed on the API Platform, so no
  // message here may tell the user to expose it as an API.
  const noInvokeUrl = IS_CLOUD && !!candidate && access.isUnavailable;
  const noEndpoint = endpoints.length > 0 && !chatUrl && !noInvokeUrl;
  const isPage = variant === 'page';

  return (
    <Stack gap={1.5} sx={{ minHeight: 0, width: '100%' }}>
      {chatError && (
        <Alert severity="error" onClose={() => setChatError(null)}>
          {chatError}
        </Alert>
      )}
      {authError && (
        <Alert severity="warning">
          {IS_CLOUD
            ? 'Could not issue a test key for this agent. Its gateway may still be starting — try again in a moment.'
            : 'Could not authenticate with the agent. Check your permissions and try again.'}
        </Alert>
      )}
      {noEndpoint && <Alert severity="info">No chat endpoint found for this agent.</Alert>}
      {noInvokeUrl && <Alert severity="warning">This agent has no invoke URL yet. Deploy it, or wait for its build to publish an endpoint.</Alert>}
      {needsManualKey && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={() => void access.mintKey()} disabled={access.isMinting}>
              Use a test key
            </Button>
          }>
          This agent is secured with OAuth. Chatting here needs a test key instead.
        </Alert>
      )}
      {!noEndpoint && !hasChatOperation && chatUrl && messages.length === 0 && (
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
          placeholder={(IS_CLOUD ? access.isMinting : generateKey.isPending) && !apiKey ? 'Authenticating…' : 'Message your agent…'}
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
