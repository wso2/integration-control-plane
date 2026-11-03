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

import { Alert, Avatar, Box, Button, CircularProgress, IconButton, InputBase, MenuItem, Select, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, Copy, SendHorizontal, Sparkles, SquarePen, User } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePortalConfig } from '../../config/portalConfig';
import { useAgentChat, type ChatMessage } from '../../hooks/useAgentChat';
import { currentLanguage, useTranslation } from '../../i18n';
import type { Integration } from '../../types/portal';
import IntegrationHeader, { PILL_SELECT_SX, TrackSelect } from '../IntegrationHeader';
import Markdown from '../Markdown';

const threadSx = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2.5,
  height: 'calc(100vh - 440px)',
  minHeight: 320,
  overflowY: 'auto',
  p: { xs: 2, md: 4 },
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
} as const;

const composerSx = { display: 'flex', alignItems: 'flex-end', gap: 1, pl: 2, pr: 0.75, py: 0.75, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', '&:focus-within': { borderColor: 'primary.main' } } as const;
const agentAvatarSx = { width: 32, height: 32, color: 'primary.main', bgcolor: 'action.selected' } as const;

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(currentLanguage(), { hour: 'numeric', minute: '2-digit' });

function Message({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  if (message.role === 'user')
    return (
      <Stack direction="row" justifyContent="flex-end" gap={1.25} alignItems="flex-start">
        <Stack alignItems="flex-end" gap={0.5} sx={{ maxWidth: '80%' }}>
          <Stack direction="row" alignItems="center" gap={0.75}>
            <Typography variant="caption" color="text.secondary">
              {timeOf(message.time)}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {t('agent.you')}
            </Typography>
          </Stack>
          <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover', borderRadius: 2, borderTopRightRadius: 4 }}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {message.content}
            </Typography>
          </Box>
        </Stack>
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'action.hover', color: 'text.secondary' }}>
          <User size={16} />
        </Avatar>
      </Stack>
    );
  return (
    <Stack direction="row" gap={1.25} alignItems="flex-start">
      <Avatar sx={agentAvatarSx}>
        <Sparkles size={16} />
      </Avatar>
      <Stack gap={0.5} sx={{ maxWidth: '80%', minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap={0.75}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
            {t('agent.agent')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {timeOf(message.time)}
          </Typography>
        </Stack>
        {message.failed ? (
          <Alert severity="error" sx={{ py: 0 }}>
            {message.content}
          </Alert>
        ) : (
          <Box sx={{ px: 2, py: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2, borderTopLeftRadius: 4 }}>
            <Markdown>{message.content}</Markdown>
          </Box>
        )}
        {!message.failed && (
          <Tooltip title={copied ? t('common.actions.copied') : t('common.actions.copy')}>
            <IconButton
              size="small"
              aria-label={t('agent.copyMessage')}
              sx={{ alignSelf: 'flex-start', color: 'text.secondary' }}
              onClick={() => {
                void navigator.clipboard.writeText(message.content);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );
}

/** A full-page chat with an AI agent, laid out as the integration console's agent chat. */
export default function AgentView({ integration }: { integration: Integration }) {
  const { t } = useTranslation();
  const config = usePortalConfig();
  const tracks = useMemo(() => integration.deploymentTracks.filter((track) => track.endpoints?.length), [integration.deploymentTracks]);
  const [trackId, setTrackId] = useState(tracks[0]?.id);
  const onTrack = tracks.find((track) => track.id === trackId)?.endpoints ?? [];
  const [endpointName, setEndpointName] = useState<string | undefined>(onTrack[0]?.name);
  const endpoint = onTrack.find((e) => e.name === endpointName) ?? onTrack[0];
  const { messages, sending, send, reset } = useAgentChat(endpoint?.url);
  const [draft, setDraft] = useState('');
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const submit = () => {
    if (!draft.trim() || sending) return;
    void send(draft);
    setDraft('');
  };

  return (
    <>
      <IntegrationHeader
        integration={integration}
        actions={
          <>
            <TrackSelect
              tracks={tracks}
              value={trackId}
              onChange={(id) => {
                setTrackId(id);
                setEndpointName(tracks.find((track) => track.id === id)?.endpoints?.[0]?.name);
              }}
            />
            {onTrack.length > 1 && (
              <Select size="small" value={endpoint?.name ?? ''} onChange={(e) => setEndpointName(e.target.value)} sx={{ ...PILL_SELECT_SX, minWidth: 150 }} inputProps={{ 'aria-label': t('agent.chatEndpoint') }}>
                {onTrack.map((e) => (
                  <MenuItem key={e.name} value={e.name}>
                    {e.displayName || e.name}
                  </MenuItem>
                ))}
              </Select>
            )}
            <Button variant="outlined" size="small" startIcon={<SquarePen size={16} />} onClick={reset} disabled={messages.length === 0}>
              {t('agent.newChat')}
            </Button>
          </>
        }
      />

      {!endpoint ? (
        <Alert severity="info">{t('agent.noEndpoint')}</Alert>
      ) : (
        <Stack gap={1.5}>
          <Box ref={thread} sx={threadSx} aria-live="polite">
            {messages.length === 0 && !sending && (
              <Stack alignItems="center" justifyContent="center" gap={1} sx={{ flex: 1 }}>
                <Sparkles size={28} style={{ opacity: 0.4 }} />
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {t('agent.empty.title', { name: integration.displayName })}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, textAlign: 'center' }}>
                  {t('agent.empty.description')}
                </Typography>
              </Stack>
            )}
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
            {sending && (
              <Stack direction="row" gap={1.25} alignItems="center">
                <Avatar sx={agentAvatarSx}>
                  <Sparkles size={16} />
                </Avatar>
                <CircularProgress size={14} />
                <Typography variant="caption" color="text.secondary">
                  {t('agent.thinking')}
                </Typography>
              </Stack>
            )}
          </Box>
          <Box sx={composerSx}>
            <InputBase
              fullWidth
              multiline
              maxRows={6}
              placeholder={t('agent.placeholder')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              sx={{ py: 0.75, fontSize: 14 }}
              inputProps={{ 'aria-label': t('agent.message') }}
            />
            <IconButton color="primary" aria-label={t('agent.send')} onClick={submit} disabled={!draft.trim() || sending}>
              <SendHorizontal size={18} />
            </IconButton>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
            {t('agent.disclaimer', { name: integration.displayName, org: config.orgName || config.orgHandle })}
          </Typography>
        </Stack>
      )}
    </>
  );
}
