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

import { Alert, Box, Button, ButtonBase, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Check, ChevronRight, ExternalLink, FileText, History, Link as LinkIcon, MessageSquare, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useAskedQuestions } from '../../../hooks/contextQuestions';
import { useContextGraph, useContextPermissions, useContextQueryResult, useContextQueryTrace } from '../../../hooks/useContextEngine';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { contextEvidenceUrl } from '../../../paths';
import { HttpError } from '../../../types/http';
import { absoluteUrl, evidencePlace, VERSION_HINT, versionFromLabel } from '../../../utils/contextEngine';
import {
  answerSentences,
  cosmosBuffers,
  entityId,
  entityConflicts,
  entityIndex,
  exploreModel,
  factEntityNames,
  factLink,
  // factPassages,
  factSelection,
  labelled,
  linkIndex,
  linkKey,
  linkSelection,
  litLinkColors,
  litPointColors,
  ordinal,
  queryConflictLink,
  shortLabel,
  withLinkSelection,
  type FactFocus,
} from '../../../utils/contextGraph';
import { EvidencePlace } from '../detail/EvidenceCard';
import { mutedSx /* , passageBadgeSx */ } from '../styles';
import CosmosCanvas from './CosmosCanvas';
import EntityPanel, { EntityChip } from './EntityPanel';
import { GRAPH_ENTITY_LIMIT } from './GraphExplorer';
import { LinkDetails } from './LinkPanel';
import { useGraphTheme } from './graphTheme';
import { canvasNoteSx, GRAPH_HEIGHT, legendDotSx, legendSx, linkTagSx, nodeLabelSx, panelLabelSx, panelSx, selectRowSx } from './graphStyles';
import type { ContextEngineDetail, ContextEvidence, ContextFact, ContextQueryConflict, ContextQueryResult, ContextQueryTrace } from '../../../types/contextEngine';

const NO_FACTS: ContextFact[] = [];
const NO_CONFLICTS: ContextQueryConflict[] = [];
/** Separates an entity's name from its kind in a selection key; a control character no name holds. */
const KIND_SEPARATOR = '\u001f';

interface ProvenanceViewProps {
  engine: ContextEngineDetail;
  orgHandle: string;
  queryId: string;
  /** Derivation key to select on arrival, such as `p:<evidence id>`, from the Playground. */
  initialKey: string | null;
  onSelectKey: (key: string | null) => void;
  onBackToAnswer: () => void;
  onExit: () => void;
  /** Open the explorer on a node, an entity or a document, by the key the graph gave it. */
  onExploreNode: (key: string) => void;
}

/**
 * The Graph tab's provenance mode: the part of the engine's graph one stored
 * answer used. The entities its facts name are lit on the graph, with the
 * relationship on each link between them, and the rest steps back. The right
 * panel lists those facts, each opening its relationship as its label on the
 * graph does, or the passages when no fact came with the query. The query is
 * reopened, so every passage is checked again; the trace, when the reader may
 * read it, adds the counts.
 */
export default function ProvenanceView({ engine, orgHandle, queryId, initialKey, onSelectKey, onBackToAnswer, onExit, onExploreNode }: ProvenanceViewProps): JSX.Element {
  const { colors, palette } = useGraphTheme();
  const result = useContextQueryResult(engine.id, queryId);
  const permissions = useContextPermissions(engine.id);
  const canTrace = !!permissions.data?.includes('trace.read');
  const trace = useContextQueryTrace(engine.id, queryId, canTrace);
  const graph = useContextGraph(engine.id, GRAPH_ENTITY_LIMIT);
  const asked = useAskedQuestions(engine.id).find((q) => q.queryId === queryId);
  const question = asked?.question ?? 'An earlier question';
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => setSelectedKey(initialKey), [initialKey]);

  const data = result.data;
  const facts = data?.facts ?? NO_FACTS;
  const conflicts = data?.conflicts ?? NO_CONFLICTS;
  const served = graph.data ?? null;
  // The key entities, plus every entity the facts and the conflicts name, so each one the graph holds can be lit.
  const keepNames = useMemo(() => factEntityNames([...facts, ...conflicts.flatMap((c) => [c.first, c.second])]), [facts, conflicts]);
  const model = useMemo(() => (served ? exploreModel(served, { records: true, entities: true, detail: 'key', keepNames }) : null), [served, keepNames]);
  const buffers = useMemo(() => (model ? cosmosBuffers(model, palette) : null), [model, palette]);
  // An entity key is "e:" + name, with the kind after a separator when known, since the same name can be two entities.
  const focus = useMemo<FactFocus>(() => {
    if (selectedKey?.startsWith('e:')) {
      const [entity, entityKind] = selectedKey.slice(2).split(KIND_SEPARATOR);
      return { entity, ...(entityKind ? { entityKind } : {}) };
    }
    return selectedKey?.startsWith('p:') ? { evidenceId: selectedKey.slice(2) } : {};
  }, [selectedKey]);
  // The engine does not cite: every statement and conflict the query returned supports it, so all are listed and lit.
  const whole = useMemo(() => (model && served ? factSelection(model, served, facts, {}, conflicts) : null), [model, served, facts, conflicts]);
  // How many of the answer's conflicts have their red line on the graph shown; null when there is no graph to draw them on.
  const drawnConflicts = useMemo(() => (model && served ? conflicts.filter((c) => queryConflictLink(model, served, c) !== undefined).length : null), [model, served, conflicts]);
  const part = useMemo(() => (model && served && (focus.entity || focus.evidenceId) ? factSelection(model, served, facts, focus, conflicts) : null), [model, served, facts, focus, conflicts]);
  // A chosen entity or passage narrows the lit part; one with no fact on the graph shows the whole answer's part.
  const lit = part && part.points.length ? part : whole;
  // A clicked label selects its link, as in the explorer: what the link joins is added to the lit part, its
  // label is drawn lit, and its panel opens. The key is the explorer's link key, so it can sit in the URL too.
  const selectedLink = selectedKey && model ? linkIndex(model, selectedKey) : undefined;
  const pick = useMemo(() => (model && served && selectedLink !== undefined ? linkSelection(model, served, selectedLink) : null), [model, served, selectedLink]);
  const shown = useMemo(() => (lit && pick ? withLinkSelection(lit, pick) : lit), [lit, pick]);
  const pointColors = useMemo(() => (model && shown ? litPointColors(model, palette, shown, palette.lit) : null), [model, palette, shown]);
  const linkColors = useMemo(() => (model && shown ? litLinkColors(model, palette, shown, palette.lit) : null), [model, palette, shown]);
  const selectedIndex = focus.entity && model && served ? (entityIndex(model, served, focus.entity, focus.entityKind) ?? null) : null;
  const labels = useMemo(() => (model && shown ? labelled(model, shown, selectedIndex, hovered, 0, 40) : []), [model, shown, selectedIndex, hovered]);

  const select = (key: string | null) => {
    setSelectedKey(key);
    onSelectKey(key);
  };
  const selectEntity = (name: string, kind?: string) => select(kind ? `e:${name}${KIND_SEPARATOR}${kind}` : `e:${name}`);
  // A relationship or a conflict line; a document line has no label to click.
  const selectLink = (link: number) => {
    const key = model ? linkKey(model, link) : undefined;
    if (key) select(key);
  };

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
          Checking the question’s evidence again…
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

  const given = data.evidence.length;
  // A query asked for passages, or one that found no answer, has no answer to speak of.
  const subject = data.answer || data.answerWithheld ? 'answer' : 'query';
  const state = data.answerWithheld ? 'Answer hidden' : data.answer ? 'Answered' : data.insufficientEvidence ? 'No answer' : 'Evidence';
  const passageOf = (id: string) => data.evidence.findIndex((e) => e.id === id) + 1;
  // A number beyond the passages returned names nothing, so it selects nothing.
  const selectPassage = (n: number) => {
    const id = data.evidence[n - 1]?.id;
    if (id) select(`p:${id}`);
  };
  const chosenPassage = focus.evidenceId ? passageOf(focus.evidenceId) : 0;
  const entityName = focus.entity ?? null;
  // The explorer selects by the engine's id, which only the graph shown knows; without it there is nothing to open.
  const exploreId = entityName && served ? entityId(served, entityName, focus.entityKind) : undefined;
  const litEntities = whole?.points.length ?? 0;

  return (
    <Box>
      <Stack direction="row" flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={1.5} sx={{ px: 1.75, py: 1.25, border: '1px solid', borderColor: 'primary.light', borderRadius: 1.25, bgcolor: 'action.hover' }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0, flexWrap: 'wrap' }}>
          <Button size="small" variant="text" startIcon={<ArrowLeft size={15} />} onClick={onBackToAnswer}>
            {subject === 'answer' ? 'Back to the answer' : 'Back to the evidence'}
          </Button>
          <Typography variant="caption" sx={mutedSx}>
            Showing how this was derived
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 0 }} noWrap title={question}>
            {question}
          </Typography>
          <Chip size="small" variant="outlined" color={state === 'Answered' ? 'success' : 'default'} label={state} />
          <Typography variant="caption" sx={mutedSx}>
            {facts.length ? `${facts.length} statement${facts.length === 1 ? '' : 's'} · ${given} evidence` : `${given} evidence`}
          </Typography>
        </Stack>
        <Button size="small" variant="outlined" startIcon={<X size={14} />} onClick={onExit}>
          Exit
        </Button>
      </Stack>

      {data.answerWithheld && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          The answer is hidden. Evidence it used is no longer available to you.
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
          ) : model && buffers && lit && shown ? (
            <CosmosCanvas
              buffers={buffers}
              layoutKey={engine.id}
              pointColors={pointColors}
              linkColors={linkColors}
              selection={shown}
              focused={selectedIndex}
              frame={pick?.points ?? lit.points}
              fitTo={whole?.points ?? null}
              labels={labels}
              renderLabel={(i) => (
                <Box sx={nodeLabelSx(i === selectedIndex, shown.points.includes(i))} title={model.nodes[i].label}>
                  {shortLabel(model.nodes[i].label)}
                </Box>
              )}
              linkTags={shown.tags}
              onSelect={(i) => {
                if (i === null) select(null);
                else if (model.nodes[i].kind === 'entity') selectEntity(model.nodes[i].label, served?.entities.find((e) => e.id === model.nodes[i].key)?.kind);
              }}
              onSelectLink={selectLink}
              onHover={setHovered}
              accent={colors.accent}
              height={GRAPH_HEIGHT}
              ariaLabel={`The part of the graph this ${subject} used: ${litEntities} entit${litEntities === 1 ? 'y' : 'ies'} lit`}>
              {facts.length === 0 && conflicts.length === 0 && (
                <Box sx={canvasNoteSx}>
                  <Typography variant="body2" sx={{ ...mutedSx, textAlign: 'center', maxWidth: 380, bgcolor: 'background.paper', borderRadius: 1, px: 2, py: 1.25, border: '1px solid', borderColor: 'divider' }}>
                    No graph relationships were used.
                  </Typography>
                </Box>
              )}
              <Box sx={{ position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none' }}>
                <Box sx={legendSx}>
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <Box sx={legendDotSx(colors.accent)} />
                    {`Named by this ${subject}’s statements`}
                  </Stack>
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <Box sx={legendDotSx(colors.muted)} />
                    Rest of the graph
                  </Stack>
                  <span>{selectedKey ? `Esc or click the background to see the whole ${subject}` : 'Click an entity to see its part, or a label to see its relationship'}</span>
                </Box>
              </Box>
            </CosmosCanvas>
          ) : (
            <Alert severity="info">The graph can’t be drawn for this engine.</Alert>
          )}
          {whole && whole.missing.length > 0 && (
            <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 1, lineHeight: 1.5 }}>
              Not in the graph shown: {whole.missing.join(', ')}.
            </Typography>
          )}
        </Box>

        {selectedLink !== undefined && model && served ? (
          <LinkDetails
            engineId={engine.id}
            orgHandle={orgHandle}
            model={model}
            graph={served}
            link={selectedLink}
            sourceName={(id) => engine.sources.find((s) => s.id === id)?.name}
            derivation={{ answer: data.answerWithheld ? undefined : data.answer, evidence: data.evidence, facts: [...facts, ...conflicts.flatMap((c) => [c.first, c.second])] }}
            onSelectEntity={selectEntity}
            // A document has no part of its own in an answer, so it opens in the explorer.
            onSelectRecord={onExploreNode}
            onSelectLink={selectLink}
            onClose={() => select(null)}
          />
        ) : chosenPassage > 0 ? (
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
            kind={focus.entityKind}
            conflicts={served && exploreId ? entityConflicts(served, exploreId) : []}
            sources={engine.sources}
            derivation={{ answer: data.answerWithheld ? undefined : data.answer, evidence: data.evidence }}
            onSelectEntity={selectEntity}
            onClose={() => select(null)}
            onExplore={exploreId ? () => onExploreNode(exploreId) : undefined}
          />
        ) : selectedKey === 'answer' ? (
          <AnswerPanel result={data} onClose={() => select(null)} />
        ) : (
          <DerivationPanel
            result={data}
            trace={trace.data ?? null}
            conflictCount={conflicts.length}
            drawnConflicts={drawnConflicts}
            sourceName={(id) => engine.sources.find((s) => s.id === id)?.name}
            facts={facts}
            linkOf={(fact) => (model && served ? factLink(model, served, fact) : undefined)}
            onSelectLink={selectLink}
            onSelectPassage={selectPassage}
            onReadAnswer={data.answer && !data.answerWithheld ? () => select('answer') : undefined}
          />
        )}
      </Box>
    </Box>
  );
}

/** Where an answer's conflicts can be seen: all drawn in red on the graph, some, none, or no graph to draw them on. */
function conflictsDrawnText(total: number, drawn: number | null): string {
  if (drawn === null) return 'They cannot be drawn, as this engine does not serve its graph yet.';
  if (drawn === total) return total === 1 ? 'It is drawn in red on the graph.' : 'Each is drawn in red on the graph.';
  if (drawn === 0) return total === 1 ? 'It is not drawn: the graph shown does not hold its entities.' : 'None is drawn: the graph shown does not hold their entities.';
  return `${drawn} of them ${drawn === 1 ? 'is' : 'are'} drawn in red on the graph; the rest name entities it does not hold.`;
}

/**
 * The right panel before anything is chosen: the statements the query
 * returned, each opening its relationship as a click on its label does; the
 * conflicts the index flagged among them; and the way to the answer itself.
 * With no statement, it lists the passages instead.
 */
function DerivationPanel({
  result,
  trace,
  conflictCount,
  drawnConflicts,
  sourceName,
  facts,
  linkOf,
  onSelectLink,
  onSelectPassage,
  onReadAnswer,
}: {
  result: ContextQueryResult;
  trace: ContextQueryTrace | null;
  /** How many conflicts are lit: every one the query returned. */
  conflictCount: number;
  /** How many of those are drawn on the graph; null when there is no graph to draw them on. */
  drawnConflicts: number | null;
  sourceName: (sourceId: string) => string | undefined;
  /** Every statement the query returned. */
  facts: ContextFact[];
  /** The line a fact stands for on the graph shown; undefined when it is not drawn. */
  linkOf: (fact: ContextFact) => number | undefined;
  onSelectLink: (link: number) => void;
  onSelectPassage: (n: number) => void;
  onReadAnswer?: () => void;
}): JSX.Element {
  const subject = result.answer || result.answerWithheld ? 'answer' : 'query';
  // A query that returned no statement lists its passages instead.
  const byFacts = facts.length > 0;
  const numbers = result.evidence.map((_, i) => i + 1);
  // Passages from one document are told apart by their place in it; otherwise by document.
  const oneDocument = result.evidence.length > 1 && result.evidence.every((e) => e.recordId === result.evidence[0].recordId && e.sourceId === result.evidence[0].sourceId);
  const rowSx = { width: '100%', justifyContent: 'flex-start', gap: 1, px: 0.75, py: 0.5, borderRadius: 1, textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } };
  const listSx = { listStyle: 'none', m: 0, mt: 0.75, p: 0 };
  // A fact the graph shown does not draw has no relationship to open, so it reads but does not click.
  const renderFact = (fact: ContextFact, i: number) => {
    const link = linkOf(fact);
    // const on = factPassages(fact, result.evidence);
    const label = [`${fact.subject} ${fact.relation} ${fact.object}`, /* on.length ? `passage${on.length === 1 ? '' : 's'} ${on.join(', ')}` : '', */ link === undefined ? 'not on the graph shown' : ''].filter(Boolean).join(', ');
    return (
      <Box component="li" key={`${fact.subject}|${fact.relation}|${fact.object}|${i}`}>
        <ButtonBase
          disabled={link === undefined}
          aria-label={label}
          onClick={link === undefined ? undefined : () => onSelectLink(link)}
          sx={{ ...selectRowSx, display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 1, '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ overflowWrap: 'anywhere' }}>
              <Box component="span" sx={{ fontWeight: 600 }}>
                {fact.subject}
              </Box>
              {/* The relationship in the pill its label wears on the graph. */}
              <Box component="span" title={fact.relation} sx={{ ...linkTagSx(), mx: 0.75, maxWidth: 160, verticalAlign: 'middle', '&:hover': {} }}>
                {fact.relation}
              </Box>
              <Box component="span" sx={{ fontWeight: 600 }}>
                {fact.object}
              </Box>
            </Box>
            {link === undefined && (
              <Stack direction="row" alignItems="center" flexWrap="wrap" gap={0.5} sx={{ mt: 0.75 }}>
                {/* The passages it stands on, hidden on the card for now.
                {on.length > 0 && (
                  <Typography component="span" variant="caption" sx={{ ...mutedSx, mr: 0.25 }}>
                    Passage{on.length === 1 ? '' : 's'}
                  </Typography>
                )}
                {on.map((n) => (
                  <Box key={n} component="span" title={`Passage ${n}`} sx={passageBadgeSx(true)}>
                    {n}
                  </Box>
                ))}
                */}
                <Chip size="small" variant="outlined" label="Not on the graph" sx={{ ml: 'auto', height: 20, fontSize: 11, color: 'text.secondary' }} />
              </Stack>
            )}
          </Box>
          {link !== undefined && (
            <Box component="span" aria-hidden sx={{ display: 'flex', flexShrink: 0, color: 'text.disabled' }}>
              <ChevronRight size={16} />
            </Box>
          )}
        </ButtonBase>
      </Box>
    );
  };
  const renderPassage = (n: number) => {
    const ev = result.evidence[n - 1];
    const place = evidencePlace(ev);
    const where = oneDocument ? place.parts.join(' · ') : [shortLabel(ev.recordId, 30), sourceName(ev.sourceId)].filter(Boolean).join(' · ');
    return (
      <Box component="li" key={ev.id}>
        <ButtonBase aria-label={`Evidence ${n}, ${ev.recordId}`} onClick={() => onSelectPassage(n)} sx={rowSx}>
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
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
            }}>
            {n}
          </Box>
          <Box sx={{ minWidth: 0, fontSize: 12.5, lineHeight: 1.35 }}>
            <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={where}>
              {where || ev.recordId}
            </Box>
          </Box>
        </ButtonBase>
      </Box>
    );
  };
  return (
    <Box component="aside" aria-label={subject === 'answer' ? 'How the answer was derived' : 'How the evidence was found'} sx={panelSx(false)}>
      {onReadAnswer && (
        <Button size="small" variant="text" startIcon={<FileText size={14} />} onClick={onReadAnswer} sx={{ alignSelf: 'flex-start', px: 0.5, minWidth: 0 }}>
          Read the answer
        </Button>
      )}
      {conflictCount > 0 && (
        <Typography variant="caption" sx={{ ...mutedSx, lineHeight: 1.5 }}>
          The index flagged {conflictCount} conflict{conflictCount === 1 ? '' : 's'} among the statements behind the evidence. {conflictsDrawnText(conflictCount, drawnConflicts)}
          {result.answer ? ' The model was told about them.' : ''}
        </Typography>
      )}
      {byFacts ? (
        <Box>
          <Typography sx={panelLabelSx}>Statements · {facts.length}</Typography>
          <Stack component="ul" gap={0.75} sx={listSx}>
            {facts.map(renderFact)}
          </Stack>
        </Box>
      ) : (
        <Box>
          <Typography sx={panelLabelSx}>Evidence · {numbers.length}</Typography>
          {oneDocument && (
            <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 0.25 }} noWrap title={result.evidence[0].recordId}>
              All from {result.evidence[0].recordId}
            </Typography>
          )}
          <Stack component="ol" gap={0.5} sx={listSx}>
            {numbers.map(renderPassage)}
          </Stack>
        </Box>
      )}
      <Typography variant="caption" sx={{ ...mutedSx, borderTop: '1px solid', borderColor: 'divider', pt: 1.25, lineHeight: 1.5 }}>
        {trace ? `Trace ${trace.traceId} · ${trace.outcome.replace('_', ' ')}${trace.retrievalMode ? ` · ${trace.retrievalMode} mode` : ''}` : `Trace ${result.traceId}`}
      </Typography>
    </Box>
  );
}

/** A passage chosen in the derivation: what it says, where it sits, and what it mentions. */
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
  const facts: ContextFact[] = result.facts.filter((f) => f.evidenceIds.includes(evidence.id));
  const names = [...new Set(facts.flatMap((f) => [f.subject, f.object]))];
  const href = contextEvidenceUrl(orgHandle, engineId, evidence.id);
  const copy = () =>
    navigator.clipboard?.writeText(absoluteUrl(href)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });

  return (
    <Box component="aside" aria-label={`Evidence ${n}`} sx={panelSx(true)}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</Box>
          <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
            Evidence
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
        <Tooltip title={VERSION_HINT}>
          <Typography variant="caption">
            {versionFromLabel(evidence.sourceVersion)} · retrieved {ordinal(n)}
          </Typography>
        </Tooltip>
      </Stack>
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
          Open evidence
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

/** The answer chosen in the derivation, sentence by sentence. */
function AnswerPanel({ result, onClose }: { result: ContextQueryResult; onClose: () => void }): JSX.Element {
  const sentences = answerSentences(result.answer);
  return (
    <Box component="aside" aria-label="The answer" sx={panelSx(true)}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600 }}>
          Answer · {sentences.length} sentence{sentences.length === 1 ? '' : 's'}
        </Typography>
        <IconButton size="small" aria-label="Release the selection" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </Stack>
      <Stack gap={1}>
        {sentences.map((sentence, i) => (
          <Box key={i} sx={{ fontSize: 13, lineHeight: 1.55 }}>
            {sentence}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
