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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Braces, Copy, Eraser, EyeOff, History, RotateCcw, Send, Unlink } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { useAskedFlag, useContextPermissions, useContextPrincipal, useQueryContextEngine, useReopenContextQuery } from '../../../hooks/useContextEngine';
import { forgetQuestion, rememberQuestion, updateQuestion, useAskedQuestions } from '../../../hooks/contextQuestions';
import { ANSWER_MODE_AVAILABLE, CONTEXT_QUERY_DEFAULT_LIMIT, CONTEXT_QUERY_MAX_LENGTH } from '../../../constants/contextEngine';
import { suggestedQuestions } from '../../../utils/contextEngine';
import { formatDistanceToNow } from '../../../utils/time';
import { contextEngineUrl, contextEvidenceUrl } from '../../../paths';
import { HttpError } from '../../../types/http';
import AnsweredTurn from './AnsweredTurn';
import EvidenceCard from './EvidenceCard';
import OwnerAccessButton from './OwnerAccessButton';
import RecentQuestions from './RecentQuestions';
import { answerCardSx, answerFooterSx, askBarSx, mutedSx, questionBubbleSx, suggestionRowSx } from '../styles';
import type { AskedQuestion, ContextEngineDetail, ContextEvidence, ContextQueryMode, ContextQueryResult } from '../../../types/contextEngine';

interface PlaygroundTabProps {
  engine: ContextEngineDetail;
  orgHandle: string;
}

interface Turn {
  question: string;
  mode: ContextQueryMode;
  result: ContextQueryResult;
  /** Reopened from the recent list: when it was asked, and how many passages it had then. */
  reopened?: { askedAt: string; passagesThen: number };
}

const MODES: { value: ContextQueryMode; label: string; hint: string; available: boolean }[] = [
  { value: 'context', label: 'Passages', hint: 'Returns the source-linked passages you are allowed to read — exactly what an agent receives.', available: true },
  { value: 'answer', label: 'Answer', hint: 'Answers in prose from the passages you are allowed to read, and cites each one.', available: ANSWER_MODE_AVAILABLE },
];

interface QueryFailure {
  message: string;
  /** The engine refused this user; they may be able to grant themselves the creator's access. */
  forbidden?: boolean;
}

function queryFailure(e: unknown, mode: ContextQueryMode): QueryFailure {
  if (e instanceof HttpError) {
    if (e.status === 403) return { message: "You don't have query access to this engine.", forbidden: true };
    if (e.status === 503 && mode === 'answer') return { message: "The engine couldn't get an answer from its language model just now, and stored nothing. Check the engine's models and keys, or ask in Passages mode." };
    if (e.status === 503) return { message: "The engine is running without its knowledge backend, so it can't search yet. Start it in provider mode with model keys." };
    if (e.status === 404 || e.status === 405) return { message: 'Querying is not available on this engine yet — the query route has not been enabled.' };
    if (e.status === 400) return { message: `The engine rejected the question: ${e.message}` };
    if (e.status === 401) return { message: 'The context engine rejected the credential.' };
  }
  return { message: "Couldn't run the query. Please try again." };
}

/** What a result amounts to, for the recent list. */
function outcomeOf(mode: ContextQueryMode, result: ContextQueryResult): AskedQuestion['outcome'] {
  if (result.answerWithheld) return 'hidden';
  if (mode === 'answer') return result.answer ? 'answered' : 'none';
  return result.evidence.length ? 'passages' : 'none';
}

function SectionHeading({ title, caption }: { title: string; caption?: string }): JSX.Element {
  return (
    <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={2} sx={{ mt: 2.5, mb: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {caption && (
        <Typography variant="caption" sx={mutedSx}>
          {caption}
        </Typography>
      )}
    </Stack>
  );
}

/** Test playground — ask in natural language, read the answer or the passages the engine lets you see, follow each to its source, and reopen what you asked before. */
export default function PlaygroundTab({ engine, orgHandle }: PlaygroundTabProps): JSX.Element {
  const navigate = useAppNavigate();
  const [params] = useSearchParams();
  const { markAsked } = useAskedFlag(engine.id);
  const [mode, setMode] = useState<ContextQueryMode>('context');
  const principal = useContextPrincipal();
  const groups = principal.data?.groups ?? [];
  const permissions = useContextPermissions(engine.id);
  const canQuery = !permissions.data || permissions.data.includes('context.read');
  const canGrantSelf = !!permissions.data?.includes('access.manage');
  // "Ask about this" on a passage page lands here with the question in the URL.
  const [question, setQuestion] = useState(() => params.get('q')?.trim() ?? '');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQueryContextEngine();
  const reopen = useReopenContextQuery();
  const rootRef = useRef<HTMLDivElement>(null);
  const asked = useAskedQuestions(engine.id);
  const sourcesById = new Map(engine.sources.map((s) => [s.id, s]));
  const llmModel = engine.models.llm?.model;

  const canAsk = canQuery && question.trim().length > 0 && question.length <= CONTEXT_QUERY_MAX_LENGTH && !query.isPending;
  const suggestions = suggestedQuestions(engine);
  const hrefFor = (ev: ContextEvidence) => contextEvidenceUrl(orgHandle, engine.id, ev.id);
  const openEvidence = (ev: ContextEvidence) => navigate(hrefFor(ev));

  const ask = (text = question, askMode = mode) => {
    const q = text.trim();
    if (!q || q.length > CONTEXT_QUERY_MAX_LENGTH || query.isPending) return;
    setNotice(null);
    query.mutate(
      { engineId: engine.id, question: q, mode: askMode, limit: CONTEXT_QUERY_DEFAULT_LIMIT },
      {
        onSuccess: (result) => {
          setTurns((prev) => [...prev, { question: q, mode: askMode, result }]);
          setQuestion('');
          markAsked();
          rememberQuestion({ queryId: result.queryId, engineId: engine.id, question: q, mode: askMode, askedAt: new Date().toISOString(), outcome: outcomeOf(askMode, result), passages: result.evidence.length });
        },
      },
    );
  };

  // Opening a recent question replaces the conversation with it and brings it into view; follow-ups then build on it.
  const reopenQuestion = (q: AskedQuestion) => {
    setNotice(null);
    reopen.mutate(q.queryId, {
      onSuccess: (result) => {
        setTurns([{ question: q.question, mode: q.mode, result, reopened: { askedAt: q.askedAt, passagesThen: q.passages } }]);
        setMode(q.mode);
        query.reset();
        if (result.answerWithheld && q.outcome !== 'hidden') updateQuestion(engine.id, q.queryId, { outcome: 'hidden' });
        window.requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      },
      onError: (e) => {
        if (e instanceof HttpError && e.status === 404) {
          forgetQuestion(engine.id, q.queryId);
          setNotice('That question is no longer stored on the engine, so it was removed from your list.');
        } else setNotice("Couldn't open that question. Please try again.");
      },
    });
  };

  const copyResult = (turn: Turn) => {
    const text = turn.result.answer && !turn.result.answerWithheld ? turn.result.answer : turn.result.evidence.map((e, i) => `[${i + 1}] ${e.passage}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(turn.result.queryId);
      window.setTimeout(() => setCopied(null), 1500);
    });
  };

  const openInApi = (turn: Turn) => navigate(`${contextEngineUrl(orgHandle, engine.id, 'api')}?q=${encodeURIComponent(turn.question)}`);

  const renderTurn = (t: Turn, i: number) => {
    const { result } = t;
    const n = result.evidence.length;
    const answered = t.mode === 'answer' && !!result.answer && !result.answerWithheld;
    const lost = t.reopened ? Math.max(0, t.reopened.passagesThen - n) : 0;
    // Full cards for passages, a hidden answer or an answer the engine declined; an answer gets its rail instead.
    const cards = result.evidence.map((ev, idx) => <EvidenceCard key={ev.id} evidence={ev} n={idx + 1} source={sourcesById.get(ev.sourceId)} href={hrefFor(ev)} onOpen={() => openEvidence(ev)} />);

    let body: JSX.Element;
    let summary: string;
    if (result.answerWithheld) {
      summary = `Answer hidden · ${t.reopened && lost ? `${n} of ${t.reopened.passagesThen} passages still available` : `${n} passage${n === 1 ? '' : 's'}`}`;
      body = (
        <>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 2, borderRadius: 1, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
            <EyeOff size={20} aria-hidden />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                The answer is hidden
              </Typography>
              <Typography variant="body2" sx={mutedSx}>
                One of the passages it was written from is no longer available to you, and showing the answer could reveal it. The passages you can still read are below.
              </Typography>
            </Box>
            <Button size="small" variant="outlined" startIcon={<RotateCcw size={14} />} disabled={!canQuery || query.isPending} onClick={() => ask(t.question, 'answer')} sx={{ flexShrink: 0 }}>
              Ask again
            </Button>
          </Box>
          {n > 0 && <SectionHeading title="Evidence you can still read" caption={t.reopened && lost ? `${n} of ${t.reopened.passagesThen} passages` : undefined} />}
          <Stack gap={1.5}>{cards}</Stack>
        </>
      );
    } else if (answered) {
      summary = `Answered${llmModel ? ` by ${llmModel}` : ''} from ${n} passage${n === 1 ? '' : 's'}`;
      body = <AnsweredTurn answer={result.answer!} evidence={result.evidence} sources={engine.sources} hrefFor={hrefFor} onOpen={openEvidence} />;
    } else if (n === 0) {
      summary = t.mode === 'answer' ? 'No answer' : '0 passages';
      body = (
        <Alert severity="info" variant="outlined">
          No passages you can read matched this question. The engine only searches indexed items whose groups map to a role you belong to{groups.length ? ` (your groups: ${groups.join(', ')})` : ''}.
        </Alert>
      );
    } else if (t.mode === 'answer') {
      summary = `No answer · ${n} passage${n === 1 ? '' : 's'} checked`;
      body = (
        <>
          <Alert severity="info" variant="outlined">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              No answer from the passages you can read
            </Typography>
            The engine found related passages, but none of them answers this, so it wrote nothing. It never answers without a passage it can cite.
          </Alert>
          <SectionHeading title="Passages it checked" caption="Shown so you can judge for yourself" />
          <Stack gap={1.5}>{cards}</Stack>
        </>
      );
    } else {
      summary = `${n} passage${n === 1 ? '' : 's'}`;
      body = (
        <>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Passages
          </Typography>
          <Stack gap={1.5}>{cards}</Stack>
        </>
      );
    }

    return (
      <Stack key={`${result.queryId}-${i}`} gap={1.5}>
        {t.reopened && (
          <Stack direction="row" alignItems="center" justifyContent="flex-end" gap={0.75}>
            <History size={14} aria-hidden />
            <Typography variant="caption" sx={mutedSx}>
              Asked {formatDistanceToNow(t.reopened.askedAt).toLowerCase() || 'earlier'} · checked again just now
            </Typography>
          </Stack>
        )}
        <Box sx={questionBubbleSx}>
          <Typography variant="body2">{t.question}</Typography>
        </Box>
        <Box sx={answerCardSx}>
          {body}
          {lost > 0 && !result.answerWithheld && (
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', mt: 1.5, p: 1.5, borderRadius: 1, border: '1px dashed', borderColor: 'divider', color: 'text.secondary' }}>
              <Unlink size={16} aria-hidden style={{ marginTop: 2 }} />
              <Typography variant="body2">
                {lost} passage{lost === 1 ? '' : 's'} from when you asked {lost === 1 ? 'is' : 'are'} no longer available. Their items changed, were removed, or are now outside what you can see.
              </Typography>
            </Box>
          )}
          <Box sx={answerFooterSx}>
            <Typography variant="caption" sx={mutedSx}>
              {summary} · query {result.queryId} · trace {result.traceId}
            </Typography>
            <Stack direction="row" gap={1}>
              <Button size="small" variant="text" startIcon={<Copy size={14} />} disabled={!answered && n === 0} onClick={() => copyResult(t)}>
                {copied === result.queryId ? 'Copied' : answered ? 'Copy answer' : 'Copy passages'}
              </Button>
              <Button size="small" variant="outlined" startIcon={<Braces size={14} />} onClick={() => openInApi(t)}>
                Use in API
              </Button>
            </Stack>
          </Box>
        </Box>
      </Stack>
    );
  };

  const shown = turns[turns.length - 1]?.result.queryId;

  return (
    <Box ref={rootRef} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 900px) minmax(260px, 320px)' }, gap: 3, alignItems: 'start', scrollMarginTop: 24 }}>
      <Stack gap={3} sx={{ minWidth: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
          <Typography variant="body2" sx={mutedSx}>
            {MODES.find((m) => m.value === mode)?.hint}
          </Typography>
          <Stack direction="row" alignItems="center" gap={1}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={mode}
              onChange={(_e, next: ContextQueryMode | null) => {
                if (next) setMode(next);
              }}
              aria-label="Query mode">
              {MODES.map((m) =>
                m.available ? (
                  <ToggleButton key={m.value} value={m.value}>
                    {m.label}
                  </ToggleButton>
                ) : (
                  <Tooltip key={m.value} title="Answers arrive with a later engine release. For now the engine returns passages.">
                    <span>
                      <ToggleButton value={m.value} disabled>
                        {m.label}
                      </ToggleButton>
                    </span>
                  </Tooltip>
                ),
              )}
            </ToggleButtonGroup>
            {turns.length > 0 && (
              <Tooltip title="Clear conversation">
                <IconButton size="small" aria-label="Clear conversation" onClick={() => setTurns([])}>
                  <Eraser size={16} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>

        {!canQuery && (
          <Alert severity="info" variant="outlined" action={canGrantSelf ? <OwnerAccessButton engineId={engine.id} /> : undefined}>
            You can open passages that are cited to you, but you can&apos;t ask this engine questions. Ask an engine manager for query access.
          </Alert>
        )}

        {turns.length === 0 && !query.isPending && canQuery && (
          <Box sx={suggestionRowSx}>
            <Typography variant="body2" sx={mutedSx}>
              Try
            </Typography>
            {suggestions.map((q) => (
              <Chip key={q} label={q} variant="outlined" clickable onClick={() => setQuestion(q)} />
            ))}
          </Box>
        )}

        {turns.map(renderTurn)}

        {notice && (
          <Alert severity="info" variant="outlined" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}

        {query.isError && (
          <Alert
            severity="error"
            variant="outlined"
            onClose={queryFailure(query.error, mode).forbidden ? undefined : () => query.reset()}
            action={queryFailure(query.error, mode).forbidden ? <OwnerAccessButton engineId={engine.id} onGranted={() => ask()} /> : undefined}>
            {queryFailure(query.error, mode).message}
          </Alert>
        )}

        <Stack gap={0.5}>
          <Box sx={askBarSx}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              size="small"
              disabled={!canQuery}
              placeholder={turns.length ? 'Ask a follow-up…' : 'Ask a question about your sources…'}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask();
              }}
              inputProps={{ 'aria-label': 'Question', maxLength: CONTEXT_QUERY_MAX_LENGTH }}
            />
            <Button variant="contained" disabled={!canAsk} startIcon={query.isPending ? <CircularProgress size={16} color="inherit" /> : <Send size={16} />} onClick={() => ask()} sx={{ flexShrink: 0 }}>
              {query.isPending ? 'Asking…' : 'Ask'}
            </Button>
          </Box>
          <Typography variant="caption" sx={{ ...mutedSx, ml: 1.75 }}>
            ⌘/Ctrl + Enter to ask
          </Typography>
        </Stack>
      </Stack>

      <RecentQuestions questions={asked} selectedId={shown} openingId={reopen.isPending ? reopen.variables : undefined} onOpen={reopenQuestion} />
    </Box>
  );
}
