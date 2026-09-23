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

import { Alert, Box, Button, Chip, CircularProgress, Link, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@wso2/oxygen-ui';
import { Send } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useQueryContextEngine } from '../../../hooks/useContextEngine';
import { CONTEXT_QUERY_DEFAULT_LIMIT, CONTEXT_QUERY_MAX_LENGTH } from '../../../constants/contextEngine';
import { HttpError } from '../../../types/http';
import { answerCardSx, askBarSx, evidenceCardSx, mutedSx, passageSx, questionBubbleSx } from '../styles';
import type { ContextEngineDetail, ContextQueryMode, ContextQueryResult } from '../../../types/contextEngine';

interface PlaygroundTabProps {
  engine: ContextEngineDetail;
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
        <Box key={ev.id} sx={evidenceCardSx}>
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

/** Test playground — ask the engine in natural language and inspect the evidence behind each answer. */
export default function PlaygroundTab({ engine }: PlaygroundTabProps): JSX.Element {
  const [mode, setMode] = useState<ContextQueryMode>('answer');
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const query = useQueryContextEngine();

  const canAsk = question.trim().length > 0 && question.length <= CONTEXT_QUERY_MAX_LENGTH && !query.isPending;

  const ask = () => {
    if (!canAsk) return;
    const asked = question.trim();
    query.mutate(
      { engineId: engine.id, question: asked, mode, limit: CONTEXT_QUERY_DEFAULT_LIMIT },
      {
        onSuccess: (result) => {
          setTurns((prev) => [...prev, { question: asked, mode, result }]);
          setQuestion('');
        },
      },
    );
  };

  return (
    <Stack gap={3} sx={{ maxWidth: 900 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Typography variant="body2" sx={mutedSx}>
          {MODES.find((m) => m.value === mode)?.hint}
        </Typography>
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
      </Stack>

      {turns.length === 0 && !query.isPending && !query.isError && (
        <Alert severity="info" variant="outlined">
          Ask anything your sources should know. Every answer cites the passages it was built from, and evidence is re-checked against your access on each read.
        </Alert>
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
              <Typography variant="body1" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
                {t.result.answer}
              </Typography>
            ) : null}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Evidence
            </Typography>
            <Evidence result={t.result} />
            <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 1.5 }}>
              Query {t.result.queryId} · trace {t.result.traceId}
            </Typography>
          </Box>
        </Stack>
      ))}

      {query.isError && (
        <Alert severity="error" variant="outlined" onClose={() => query.reset()}>
          {queryErrorMessage(query.error)}
        </Alert>
      )}

      <Box sx={askBarSx}>
        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={6}
          size="small"
          placeholder="Ask a question about your sources…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask();
          }}
          inputProps={{ 'aria-label': 'Question', maxLength: CONTEXT_QUERY_MAX_LENGTH }}
          helperText="⌘/Ctrl + Enter to ask"
        />
        <Button variant="contained" disabled={!canAsk} startIcon={query.isPending ? <CircularProgress size={16} color="inherit" /> : <Send size={16} />} onClick={ask} sx={{ mt: 0.5, flexShrink: 0 }}>
          {query.isPending ? 'Asking…' : 'Ask'}
        </Button>
      </Box>
    </Stack>
  );
}
