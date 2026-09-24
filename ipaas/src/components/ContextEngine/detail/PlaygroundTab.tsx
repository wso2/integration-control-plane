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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, Link, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Braces, Copy, Eraser, Send } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { useAskedFlag, useQueryContextEngine } from '../../../hooks/useContextEngine';
import { CONTEXT_QUERY_DEFAULT_LIMIT, CONTEXT_QUERY_MAX_LENGTH } from '../../../constants/contextEngine';
import { splitCitations, suggestedQuestions } from '../../../utils/contextEngine';
import { contextEngineUrl } from '../../../paths';
import { HttpError } from '../../../types/http';
import { answerCardSx, answerFooterSx, askBarSx, citeChipSx, evidenceCardSx, mutedSx, passageSx, questionBubbleSx, suggestionRowSx } from '../styles';
import type { ContextEngineDetail, ContextQueryMode, ContextQueryResult } from '../../../types/contextEngine';

interface PlaygroundTabProps {
  engine: ContextEngineDetail;
  orgHandle: string;
}

interface Turn {
  question: string;
  mode: ContextQueryMode;
  result: ContextQueryResult;
}

const MODES: { value: ContextQueryMode; label: string; hint: string }[] = [
  { value: 'answer', label: 'Answer', hint: 'Compose an answer from the evidence with the language model.' },
  { value: 'context', label: 'Context', hint: 'Return the matching passages only — what an agent would receive.' },
];

function queryErrorMessage(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 404 || e.status === 405) return 'Querying is not available on this engine yet — the query route has not been enabled.';
    if (e.status === 403) return "You don't have query access to this engine.";
    if (e.status === 401) return 'The context engine rejected the credential.';
  }
  return "Couldn't run the query. Please try again.";
}

const evidenceId = (queryId: string, n: number): string => `evidence-${queryId}-${n}`;

function jumpTo(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** The answer text with `[n]` markers rendered as chips that jump to the matching evidence card. */
function CitedAnswer({ answer, queryId }: { answer: string; queryId: string }): JSX.Element {
  return (
    <Typography variant="body1" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
      {splitCitations(answer).map((part, i) =>
        part.kind === 'text' ? (
          <span key={i}>{part.text}</span>
        ) : (
          <Chip key={i} component="button" size="small" color="primary" variant="outlined" label={part.n} clickable onClick={() => jumpTo(evidenceId(queryId, part.n))} aria-label={`Evidence ${part.n}`} sx={citeChipSx} />
        ),
      )}
    </Typography>
  );
}

function Evidence({ result }: { result: ContextQueryResult }): JSX.Element {
  if (result.evidence.length === 0) {
    return (
      <Typography variant="body2" sx={mutedSx}>
        No evidence was returned.
      </Typography>
    );
  }
  return (
    <Stack gap={1.5}>
      {result.evidence.map((ev, i) => (
        <Box key={ev.id} id={evidenceId(result.queryId, i + 1)} sx={evidenceCardSx}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Chip size="small" label={`[${i + 1}]`} />
              <Typography variant="caption" sx={mutedSx}>
                {ev.sourceId} · v{ev.sourceVersion}
                {ev.location ? ` · ${ev.location}` : ''}
              </Typography>
            </Stack>
            {ev.sourceUrl && (
              <Link href={ev.sourceUrl} target="_blank" rel="noopener noreferrer" variant="caption">
                Open source
              </Link>
            )}
          </Stack>
          <Typography variant="body2" sx={passageSx}>
            “{ev.passage}”
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

/** Test playground — ask in natural language, read cited evidence, then hand a good question to the API tab. */
export default function PlaygroundTab({ engine, orgHandle }: PlaygroundTabProps): JSX.Element {
  const navigate = useAppNavigate();
  const { markAsked } = useAskedFlag(engine.id);
  const [mode, setMode] = useState<ContextQueryMode>('answer');
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const query = useQueryContextEngine();

  const canAsk = question.trim().length > 0 && question.length <= CONTEXT_QUERY_MAX_LENGTH && !query.isPending;
  const suggestions = suggestedQuestions(engine);

  const ask = (text = question) => {
    const asked = text.trim();
    if (!asked || asked.length > CONTEXT_QUERY_MAX_LENGTH || query.isPending) return;
    query.mutate(
      { engineId: engine.id, question: asked, mode, limit: CONTEXT_QUERY_DEFAULT_LIMIT },
      {
        onSuccess: (result) => {
          setTurns((prev) => [...prev, { question: asked, mode, result }]);
          setQuestion('');
          markAsked();
        },
      },
    );
  };

  const copyAnswer = (turn: Turn) => {
    const text = turn.result.answer ?? turn.result.evidence.map((e, i) => `[${i + 1}] ${e.passage}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(turn.result.queryId);
      window.setTimeout(() => setCopied(null), 1500);
    });
  };

  const openInApi = (turn: Turn) => navigate(`${contextEngineUrl(orgHandle, engine.id, 'api')}?q=${encodeURIComponent(turn.question)}`);

  return (
    <Stack gap={3} sx={{ maxWidth: 900 }}>
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
            {MODES.map((m) => (
              <ToggleButton key={m.value} value={m.value}>
                {m.label}
              </ToggleButton>
            ))}
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

      {turns.length === 0 && !query.isPending && (
        <Box sx={suggestionRowSx}>
          <Typography variant="body2" sx={mutedSx}>
            Try
          </Typography>
          {suggestions.map((q) => (
            <Chip key={q} label={q} variant="outlined" clickable onClick={() => setQuestion(q)} />
          ))}
        </Box>
      )}

      {turns.map((t, i) => (
        <Stack key={`${t.result.queryId}-${i}`} gap={1.5}>
          <Box sx={questionBubbleSx}>
            <Typography variant="body2">{t.question}</Typography>
          </Box>
          <Box sx={answerCardSx}>
            {t.result.insufficientEvidence ? (
              <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }}>
                The engine did not find enough evidence to answer this question.
              </Alert>
            ) : t.mode === 'answer' && t.result.answer ? (
              <CitedAnswer answer={t.result.answer} queryId={t.result.queryId} />
            ) : null}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Evidence
            </Typography>
            <Evidence result={t.result} />
            <Box sx={answerFooterSx}>
              <Typography variant="caption" sx={mutedSx}>
                {t.result.evidence.length} source{t.result.evidence.length === 1 ? '' : 's'} · query {t.result.queryId} · trace {t.result.traceId}
              </Typography>
              <Stack direction="row" gap={1}>
                <Button size="small" variant="text" startIcon={<Copy size={14} />} onClick={() => copyAnswer(t)}>
                  {copied === t.result.queryId ? 'Copied' : 'Copy answer'}
                </Button>
                <Button size="small" variant="outlined" startIcon={<Braces size={14} />} onClick={() => openInApi(t)}>
                  Use in API
                </Button>
              </Stack>
            </Box>
          </Box>
        </Stack>
      ))}

      {query.isError && (
        <Alert severity="error" variant="outlined" onClose={() => query.reset()}>
          {queryErrorMessage(query.error)}
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
  );
}
