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

import { Alert, Box, Button, ButtonBase, Chip, CircularProgress, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Check, ExternalLink, FileText, History, Link as LinkIcon, MessageSquare, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useAskedQuestions } from '../../../hooks/contextQuestions';
import { useContextGraph, useContextPermissions, useContextQueryResult, useContextQueryTrace } from '../../../hooks/useContextEngine';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { contextEvidenceUrl } from '../../../paths';
import { HttpError } from '../../../types/http';
import { absoluteUrl, evidencePlace, evidenceVersionLabel } from '../../../utils/contextEngine';
import {
  answerSentences,
  citedPassages,
  cosmosBuffers,
  derivationSummary,
  entityId,
  entityIndex,
  exploreModel,
  factEntityNames,
  factSelection,
  labelled,
  litLinkColors,
  litPointColors,
  ordinal,
  sentencesCiting,
  shortLabel,
  type FactFocus,
} from '../../../utils/contextGraph';
import { EvidencePlace } from '../detail/EvidenceCard';
import { mutedSx } from '../styles';
import CosmosCanvas from './CosmosCanvas';
import EntityPanel, { EntityChip } from './EntityPanel';
import { GRAPH_ENTITY_LIMIT } from './GraphExplorer';
import { useGraphTheme } from './graphTheme';
import { canvasNoteSx, GRAPH_HEIGHT, legendDotSx, legendSx, nodeLabelSx, panelLabelSx, panelSx, sentenceSx } from './graphStyles';
import type { ContextEngineDetail, ContextEvidence, ContextFact, ContextQueryResult, ContextQueryTrace } from '../../../types/contextEngine';

const NO_FACTS: ContextFact[] = [];

interface ProvenanceViewProps {
  engine: ContextEngineDetail;
  orgHandle: string;
  queryId: string;
  /** Derivation key to select on arrival, such as `p:<evidence id>`, from the Playground. */
  initialKey: string | null;
  onSelectKey: (key: string | null) => void;
  onBackToAnswer: () => void;
  onExit: () => void;
  /** Open the explorer on an entity, by the id the graph gave it. */
  onExploreEntity: (id: string) => void;
}

/**
 * The Graph tab's provenance mode: the part of the engine's graph one stored
 * answer used. The entities its facts name are lit on the graph, with the
 * relationship on each link between them, and the rest steps back. The right
 * panel lists what the engine recorded, step by step, with every passage the
 * answer was written from. The query is reopened, so every passage is checked
 * again; the trace, when the reader may read it, adds the counts.
 */
export default function ProvenanceView({ engine, orgHandle, queryId, initialKey, onSelectKey, onBackToAnswer, onExit, onExploreEntity }: ProvenanceViewProps): JSX.Element {
  const { colors, palette } = useGraphTheme();
  const result = useContextQueryResult(queryId);
  const permissions = useContextPermissions(engine.id);
  const canTrace = !!permissions.data?.includes('trace.read');
  const trace = useContextQueryTrace(queryId, canTrace);
  const graph = useContextGraph(engine.id, GRAPH_ENTITY_LIMIT);
  const asked = useAskedQuestions(engine.id).find((q) => q.queryId === queryId);
  const question = asked?.question ?? 'An earlier question';
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => setSelectedKey(initialKey), [initialKey]);

  const data = result.data;
  const facts = data?.facts ?? NO_FACTS;
  const served = graph.data ?? null;
  // The key entities, plus every entity the facts name, so each one the graph holds can be lit.
  const keepNames = useMemo(() => factEntityNames(facts), [facts]);
  const model = useMemo(() => (served ? exploreModel(served, { records: true, entities: true, detail: 'key', keepNames }) : null), [served, keepNames]);
  const buffers = useMemo(() => (model ? cosmosBuffers(model, palette) : null), [model, palette]);
  const focus = useMemo<FactFocus>(() => (selectedKey?.startsWith('e:') ? { entity: selectedKey.slice(2) } : selectedKey?.startsWith('p:') ? { evidenceId: selectedKey.slice(2) } : {}), [selectedKey]);
  const whole = useMemo(() => (model && served ? factSelection(model, served, facts) : null), [model, served, facts]);
  const part = useMemo(() => (model && served && (focus.entity || focus.evidenceId) ? factSelection(model, served, facts, focus) : null), [model, served, facts, focus]);
  // A chosen entity or passage narrows the lit part; one with no fact on the graph shows the whole answer's part.
  const lit = part && part.points.length ? part : whole;
  const pointColors = useMemo(() => (model && lit ? litPointColors(model, palette, lit, palette.lit) : null), [model, palette, lit]);
  const linkColors = useMemo(() => (model && lit ? litLinkColors(model, palette, lit, palette.lit) : null), [model, palette, lit]);
  const selectedIndex = focus.entity && model && served ? (entityIndex(model, served, focus.entity) ?? null) : null;
  const labels = useMemo(() => (model && lit ? labelled(model, lit, selectedIndex, hovered, 0, 40) : []), [model, lit, selectedIndex, hovered]);

  const select = (key: string | null) => {
    setSelectedKey(key);
    onSelectKey(key);
  };
  const selectEntity = (name: string) => select(`e:${name}`);

  useEffect(() => {
    if (!selectedKey) return;
    const release = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', release);
    return () => window.removeEventListener('keydown', release);
    // `select` changes every render; the listener only needs the current key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  if (result.isLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" gap={1.5} sx={{ height: GRAPH_HEIGHT }}>
        <CircularProgress size={22} />
        <Typography variant="body2" sx={mutedSx}>
          Checking the question’s passages again…
        </Typography>
      </Stack>
    );
  }
  if (result.isError || !data) {
    const gone = result.error instanceof HttpError && result.error.status === 404;
    return (
      <Alert severity={gone ? 'info' : 'error'} action={<Button onClick={onExit}>Back to the graph</Button>}>
        {gone ? 'That question is no longer stored on the engine, so its derivation can’t be shown.' : 'Couldn’t open that question. Please try again.'}
      </Alert>
    );
  }

  const cited = citedPassages(data.answer);
  const given = data.evidence.length;
  const state = data.answerWithheld ? 'Answer hidden' : data.answer ? 'Answered' : data.insufficientEvidence ? 'No answer' : 'Passages';
  const passageOf = (id: string) => data.evidence.findIndex((e) => e.id === id) + 1;
  // An `[n]` beyond the passages the model was given names nothing, so it selects nothing.
  const selectPassage = (n: number) => {
    const id = data.evidence[n - 1]?.id;
    if (id) select(`p:${id}`);
  };
  const chosenPassage = focus.evidenceId ? passageOf(focus.evidenceId) : 0;
  const entityName = focus.entity ?? null;
  // The explorer selects by the engine's id, which only the graph shown knows; without it there is nothing to open.
  const exploreId = entityName && served ? entityId(served, entityName) : undefined;
  const litEntities = whole?.points.length ?? 0;

  return (
    <Box>
      <Stack direction="row" flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={1.5} sx={{ px: 1.75, py: 1.25, border: '1px solid', borderColor: 'primary.light', borderRadius: 1.25, bgcolor: 'action.hover' }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0, flexWrap: 'wrap' }}>
          <Button size="small" variant="text" startIcon={<ArrowLeft size={15} />} onClick={onBackToAnswer}>
            Back to the answer
          </Button>
          <Typography variant="caption" sx={mutedSx}>
            Showing how this was derived
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 0 }} noWrap title={question}>
            {question}
          </Typography>
          <Chip size="small" variant="outlined" color={state === 'Answered' ? 'success' : 'default'} label={state} />
          <Typography variant="caption" sx={mutedSx}>
            {data.answer ? `${cited.size} passage${cited.size === 1 ? '' : 's'} cited · ${given} given` : `${given} passage${given === 1 ? '' : 's'}`}
          </Typography>
        </Stack>
        <Button size="small" variant="outlined" startIcon={<X size={14} />} onClick={onExit}>
          Exit
        </Button>
      </Stack>

      {data.answerWithheld && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          The answer is hidden because a passage it was written from is no longer within your reach. The passages you can still read are shown.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 330px' }, gap: 3, mt: 1.75, alignItems: 'start' }}>
        <Box>
          {graph.isLoading ? (
            <Stack alignItems="center" justifyContent="center" gap={1.5} sx={{ height: GRAPH_HEIGHT }}>
              <CircularProgress size={22} />
              <Typography variant="body2" sx={mutedSx}>
                Reading the graph you can see…
              </Typography>
            </Stack>
          ) : model && buffers && lit ? (
            <CosmosCanvas
              buffers={buffers}
              pointColors={pointColors}
              linkColors={linkColors}
              selection={lit}
              focused={selectedIndex}
              frame={lit.points}
              fitTo={whole?.points ?? null}
              labels={labels}
              renderLabel={(i) => (
                <Box sx={nodeLabelSx(i === selectedIndex, lit.points.includes(i))} title={model.nodes[i].label}>
                  {shortLabel(model.nodes[i].label)}
                </Box>
              )}
              linkTags={lit.tags}
              onSelect={(i) => {
                if (i === null) select(null);
                else if (model.nodes[i].kind === 'entity') select(`e:${model.nodes[i].label}`);
              }}
              onHover={setHovered}
              accent={colors.accent}
              height={GRAPH_HEIGHT}
              ariaLabel={`The part of the graph this answer used: ${litEntities} entit${litEntities === 1 ? 'y' : 'ies'} lit`}>
              {facts.length === 0 && (
                <Box sx={canvasNoteSx}>
                  <Typography variant="body2" sx={{ ...mutedSx, textAlign: 'center', maxWidth: 380, bgcolor: 'background.paper', borderRadius: 1, px: 2, py: 1.25, border: '1px solid', borderColor: 'divider' }}>
                    No graph relationships took part in this answer. It was written from the passages listed on the right.
                  </Typography>
                </Box>
              )}
              <Box sx={{ position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none' }}>
                <Box sx={legendSx}>
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <Box sx={legendDotSx(colors.accent)} />
                    Named by this answer’s facts
                  </Stack>
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <Box sx={legendDotSx(colors.muted)} />
                    Rest of the graph
                  </Stack>
                  <span>{selectedKey ? 'Esc or click the background to see the whole answer' : 'Click an entity to see its part'}</span>
                </Box>
              </Box>
            </CosmosCanvas>
          ) : (
            <Alert severity="info">This engine doesn’t serve its graph yet, so the entities this answer used can’t be drawn. The steps on the right still show how it was derived.</Alert>
          )}
          {whole && whole.missing.length > 0 && (
            <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 1, lineHeight: 1.5 }}>
              Not in the graph shown: {whole.missing.join(', ')}. The graph view holds the most-mentioned entities; the facts still stand on the passages listed.
            </Typography>
          )}
        </Box>

        {chosenPassage > 0 ? (
          <PassagePanel
            result={data}
            n={chosenPassage}
            engineId={engine.id}
            orgHandle={orgHandle}
            sourceName={engine.sources.find((s) => s.id === data.evidence[chosenPassage - 1]?.sourceId)?.name}
            onSelectEntity={selectEntity}
            onShowInPlayground={onBackToAnswer}
            onClose={() => select(null)}
          />
        ) : entityName ? (
          <EntityPanel
            engineId={engine.id}
            orgHandle={orgHandle}
            name={entityName}
            sources={engine.sources}
            derivation={{ answer: data.answerWithheld ? undefined : data.answer, evidence: data.evidence }}
            onSelectEntity={selectEntity}
            onClose={() => select(null)}
            onExplore={exploreId ? () => onExploreEntity(exploreId) : undefined}
          />
        ) : selectedKey === 'answer' ? (
          <AnswerPanel result={data} onSelectPassage={selectPassage} onClose={() => select(null)} />
        ) : (
          <DerivationSteps
            result={data}
            trace={trace.data ?? null}
            canTrace={canTrace}
            permissionsKnown={!!permissions.data}
            modelName={trace.data?.models.answer?.model ?? engine.models.llm?.model}
            sourceName={(id) => engine.sources.find((s) => s.id === id)?.name}
            onSelectPassage={selectPassage}
            onReadAnswer={data.answer && !data.answerWithheld ? () => select('answer') : undefined}
          />
        )}
      </Box>
    </Box>
  );
}

/** The right panel before anything is chosen: what the engine did, step by step, from what it recorded, and every passage the answer was written from. */
function DerivationSteps({
  result,
  trace,
  canTrace,
  permissionsKnown,
  modelName,
  sourceName,
  onSelectPassage,
  onReadAnswer,
}: {
  result: ContextQueryResult;
  trace: ContextQueryTrace | null;
  canTrace: boolean;
  permissionsKnown: boolean;
  modelName?: string;
  sourceName: (sourceId: string) => string | undefined;
  onSelectPassage: (n: number) => void;
  onReadAnswer?: () => void;
}): JSX.Element {
  const summary = derivationSummary(result);
  const cited = citedPassages(result.answer);
  const through = [...new Set(result.facts.map((f) => f.linkedThrough).filter((n): n is string => !!n))];
  const uncited = result.evidence.map((_, i) => i + 1).filter((n) => !cited.has(n));
  const citations = [...cited]
    .sort((a, b) => a - b)
    .map((n) => {
      const k = sentencesCiting(result.answer, n).length;
      return `[${n}] cited${k > 1 ? ` ${k} times` : ''}`;
    });
  const steps: { title: string; body: string; lit?: boolean }[] = [
    { title: 'Scope', body: 'Only the sources you may read were searched; the engine never says what else exists.' },
    {
      title: 'Retrieval',
      body: [
        trace ? `${trace.retrieved} passage${trace.retrieved === 1 ? '' : 's'} matched the question, kept in rank order.` : `${result.evidence.length} passage${result.evidence.length === 1 ? '' : 's'} came back, in rank order.`,
        result.facts.length ? 'The graph search added facts about them.' : '',
        through.length ? `The graph walk followed ${through.join(', ')} to other records.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    {
      title: 'Access check',
      body: trace
        ? trace.suppressed
          ? `${trace.suppressed} withheld by the access check; the engine never says which.`
          : 'Every passage passed the access check: active, indexed, readable by you, at its current version.'
        : 'Every passage shown passed the access check: active, indexed, readable by you, at its current version.',
    },
    result.answer
      ? {
          title: 'Answer',
          lit: true,
          body: `${modelName ?? 'The language model'} wrote ${summary.sentences} sentence${summary.sentences === 1 ? '' : 's'} from the ${result.evidence.length} passage${result.evidence.length === 1 ? '' : 's'} it was given. Citations checked: ${citations.join(', ') || 'none'}${uncited.length ? `; ${uncited.map((n) => `passage ${n}`).join(', ')} given, not cited` : ''}.`,
        }
      : { title: 'Answer', body: result.answerWithheld ? 'Hidden: a passage it was written from is out of your reach now.' : result.insufficientEvidence ? 'None: the passages did not answer the question.' : 'Passages only: no answer was written.' },
    {
      title: 'Entities',
      body: result.facts.length
        ? `${result.facts.length} fact${result.facts.length === 1 ? '' : 's'} from the graph stand on these passages, naming ${summary.entities} entit${summary.entities === 1 ? 'y' : 'ies'}. They are lit on the graph. They explain what the passages contain; the answer cites passages, not facts.`
        : 'No graph facts came with this query, so its derivation runs through passages alone.',
    },
  ];
  // Passages from one document are told apart by their place in it; otherwise by document.
  const oneDocument = result.evidence.length > 1 && result.evidence.every((e) => e.recordId === result.evidence[0].recordId && e.sourceId === result.evidence[0].sourceId);
  const statusOf = (n: number) => {
    if (!result.answer) return 'returned';
    const k = sentencesCiting(result.answer, n).length;
    return k ? `cited${k > 1 ? ` in ${k} sentences` : ''}` : 'given, not cited';
  };
  return (
    <Box component="aside" aria-label="How the answer was derived" sx={panelSx(false)}>
      <Box>
        <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
          How the answer was derived
        </Typography>
        <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 0.5, lineHeight: 1.5 }}>
          What the engine recorded for this question. No model reasoning is kept.
        </Typography>
      </Box>
      <Stack component="ol" gap={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {steps.map((step, i) => (
          <Stack component="li" key={step.title} direction="row" gap={1.25}>
            <Box
              aria-hidden
              sx={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', bgcolor: step.lit ? 'primary.main' : 'text.primary', color: 'background.paper', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {i + 1}
            </Box>
            <Box sx={{ fontSize: 13, lineHeight: 1.5 }}>
              <Box sx={{ fontWeight: 600 }}>{step.title}</Box>
              <Box sx={mutedSx}>{step.body}</Box>
              {step.title === 'Answer' && onReadAnswer && (
                <Button size="small" variant="text" startIcon={<FileText size={14} />} onClick={onReadAnswer} sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}>
                  Read the answer with its citations
                </Button>
              )}
            </Box>
          </Stack>
        ))}
      </Stack>
      <Box>
        <Typography sx={panelLabelSx}>Passages · {result.evidence.length}</Typography>
        {oneDocument && (
          <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 0.25 }} noWrap title={result.evidence[0].recordId}>
            All from {result.evidence[0].recordId}
          </Typography>
        )}
        <Stack component="ol" gap={0.5} sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0 }}>
          {result.evidence.map((ev, i) => {
            const n = i + 1;
            const strong = !result.answer || cited.has(n);
            const place = evidencePlace(ev);
            const where = oneDocument ? place.parts.join(' · ') : [shortLabel(ev.recordId, 30), sourceName(ev.sourceId)].filter(Boolean).join(' · ');
            return (
              <Box component="li" key={ev.id}>
                <ButtonBase
                  aria-label={`Passage ${n}, ${ev.recordId}, ${statusOf(n)}`}
                  onClick={() => onSelectPassage(n)}
                  sx={{ width: '100%', justifyContent: 'flex-start', gap: 1, px: 0.75, py: 0.5, borderRadius: 1, textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}>
                  <Box
                    sx={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: strong ? 'primary.main' : 'transparent',
                      color: strong ? '#fff' : 'text.secondary',
                      border: strong ? 'none' : '1.5px solid',
                      borderColor: 'text.disabled',
                    }}>
                    {n}
                  </Box>
                  <Box sx={{ minWidth: 0, fontSize: 12.5, lineHeight: 1.35 }}>
                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={where}>
                      {where || ev.recordId}
                    </Box>
                    <Box sx={{ ...mutedSx, fontSize: 11.5 }}>{statusOf(n)}</Box>
                  </Box>
                </ButtonBase>
              </Box>
            );
          })}
        </Stack>
      </Box>
      <Typography variant="caption" sx={{ ...mutedSx, borderTop: '1px solid', borderColor: 'divider', pt: 1.25, lineHeight: 1.5 }}>
        {trace ? `Trace ${trace.traceId} · ${trace.outcome.replace('_', ' ')}${trace.retrievalMode ? ` · ${trace.retrievalMode} mode` : ''}` : `Trace ${result.traceId}`}
        {permissionsKnown && !canTrace ? ' · retrieval counts need trace access' : ''}
        <br />
        Click an entity on the graph, or a passage here, to see its part in the answer.
      </Typography>
    </Box>
  );
}

/** A passage chosen in the derivation: what it says, where it sits, and its part in the answer. */
function PassagePanel({
  result,
  n,
  engineId,
  orgHandle,
  sourceName,
  onSelectEntity,
  onShowInPlayground,
  onClose,
}: {
  result: ContextQueryResult;
  n: number;
  engineId: string;
  orgHandle: string;
  sourceName?: string;
  onSelectEntity: (name: string) => void;
  onShowInPlayground: () => void;
  onClose: () => void;
}): JSX.Element {
  const navigate = useAppNavigate();
  const [copied, setCopied] = useState(false);
  const evidence: ContextEvidence | undefined = result.evidence[n - 1];
  if (!evidence) return <Box sx={panelSx(false)} />;
  const sentences = sentencesCiting(result.answer, n);
  const cited = sentences.length > 0;
  const facts: ContextFact[] = result.facts.filter((f) => f.evidenceIds.includes(evidence.id));
  const names = [...new Set(facts.flatMap((f) => [f.subject, f.object]))];
  const href = contextEvidenceUrl(orgHandle, engineId, evidence.id);
  const status = !result.answer ? 'returned' : cited ? `cited${sentences.length > 1 ? ` in ${sentences.length} sentences` : ''}` : 'given, not cited';
  const copy = () =>
    navigator.clipboard?.writeText(absoluteUrl(href)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });

  return (
    <Box component="aside" aria-label={`Passage ${n}`} sx={panelSx(true)}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: cited || !result.answer ? 'primary.main' : 'text.disabled', color: '#fff', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</Box>
          <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
            Passage · {status}
          </Typography>
        </Stack>
        <IconButton size="small" aria-label="Release the selection" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </Stack>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={evidence.recordId}>
          {evidence.recordId}
        </Typography>
        <Typography variant="caption" sx={mutedSx}>
          {sourceName ?? evidence.sourceId} · <EvidencePlace evidence={evidence} showRecord={false} />
        </Typography>
      </Box>
      <Box sx={{ fontSize: 13, lineHeight: 1.5, bgcolor: 'action.hover', borderRadius: 1, p: 1.25, maxHeight: 220, overflowY: 'auto' }}>“{evidence.passage}”</Box>
      <Stack direction="row" alignItems="center" gap={0.75} sx={mutedSx}>
        <History size={13} aria-hidden />
        <Typography variant="caption">
          Version of {evidenceVersionLabel(evidence.sourceVersion)} · retrieved {ordinal(n)}
        </Typography>
      </Stack>
      {result.answer && (
        <Box>
          <Typography sx={panelLabelSx}>Its part in the answer</Typography>
          {cited ? (
            <Stack gap={0.75} sx={{ mt: 0.75 }}>
              {sentences.map((s) => (
                <Box key={s} component="span" sx={sentenceSx}>
                  {s}
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ ...mutedSx, mt: 0.5, lineHeight: 1.5 }}>
              The model was given it but cited it nowhere. It still counts: the engine checks it before showing this answer again.
            </Typography>
          )}
        </Box>
      )}
      {names.length > 0 && (
        <Box>
          <Typography sx={panelLabelSx}>Mentions</Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
            {names.map((name) => (
              <EntityChip key={name} name={name} onSelect={onSelectEntity} lit />
            ))}
          </Stack>
        </Box>
      )}
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <Button size="small" variant="outlined" startIcon={<ExternalLink size={15} />} onClick={() => navigate(href)}>
          Open passage
        </Button>
        <Button size="small" variant="text" startIcon={copied ? <Check size={15} /> : <LinkIcon size={15} />} onClick={() => void copy()}>
          {copied ? 'Link copied' : 'Copy link'}
        </Button>
        <Button size="small" variant="text" startIcon={<MessageSquare size={15} />} onClick={onShowInPlayground}>
          Show in Playground
        </Button>
      </Stack>
    </Box>
  );
}

/** The answer chosen in the derivation: its sentences, each with the passages it cites. */
function AnswerPanel({ result, onSelectPassage, onClose }: { result: ContextQueryResult; onSelectPassage: (n: number) => void; onClose: () => void }): JSX.Element {
  const summary = derivationSummary(result);
  const sentences = answerSentences(result.answer);
  return (
    <Box component="aside" aria-label="The answer" sx={panelSx(true)}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
          Answer · {summary.sentences} sentence{summary.sentences === 1 ? '' : 's'}
        </Typography>
        <IconButton size="small" aria-label="Release the selection" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </Stack>
      <Stack gap={1}>
        {sentences.map((sentence, i) => {
          const numbers = [...citedPassages(sentence)].sort((a, b) => a - b);
          return (
            <Box key={i} sx={{ fontSize: 13, lineHeight: 1.55 }}>
              {sentence.replace(/\s*\[(\s*\d{1,3}(?:\s*,\s*\d{1,3})*\s*)\]/g, '')}{' '}
              {numbers.map((n) => (
                <ButtonBase
                  key={n}
                  aria-label={`Passage ${n}`}
                  onClick={() => onSelectPassage(n)}
                  sx={{ ml: 0.5, minWidth: 18, height: 18, px: 0.5, borderRadius: 9, bgcolor: 'primary.main', color: '#fff', fontSize: 10.5, fontWeight: 700, verticalAlign: 'text-top' }}>
                  {n}
                </ButtonBase>
              ))}
            </Box>
          );
        })}
      </Stack>
      <Typography variant="caption" sx={{ ...mutedSx, lineHeight: 1.5 }}>
        Each number is a passage the model was given; the engine kept only citations of those.
      </Typography>
    </Box>
  );
}
