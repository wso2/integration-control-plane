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

import { Box, Button, ButtonBase, CircularProgress, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { MessageSquare, X } from '@wso2/oxygen-ui-icons-react';
import { type JSX, type ReactNode } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { useContextEntity } from '../../../hooks/useContextEngine';
import { contextEngineUrl } from '../../../paths';
import { conflictLink, conflictsOn, factIs, relationLink, relationOf, sameRelation, sentencesCiting, type GraphModel } from '../../../utils/contextGraph';
import { EntityChip, PassageRow } from './EntityPanel';
import { mutedSx } from '../styles';
import { panelLabelSx, panelSx, selectRowSx, sentenceSx } from './graphStyles';
import type { ContextEntityView, ContextEvidence, ContextFact, ContextGraph, ContextGraphConflict, ContextGraphRelation } from '../../../types/contextEngine';

/** An entity at one end of a relationship, as the panel names it. */
export interface LinkEnd {
  name: string;
  kind?: string;
}

/** A document a relationship was taken from. */
export interface LinkRecord {
  id: string;
  label: string;
  sourceName?: string;
  /** Drawn on the canvas, so it can be selected. */
  drawn: boolean;
}

/** A relationship with everything the panels say about it. */
export interface RelationView {
  relation: ContextGraphRelation;
  subject: LinkEnd;
  object: LinkEnd;
  records: LinkRecord[];
  /** Its link is drawn on the canvas, so it can be selected. */
  drawn: boolean;
}

/** A conflict with both of its sides spelled out, and its place in the graph's list. */
export interface ConflictView {
  index: number;
  first: RelationView;
  second: RelationView;
  reason: string;
  confidence: number | null;
  /** Its line is drawn on the canvas, so it can be selected. */
  drawn: boolean;
}

const sentenceOf = (view: RelationView): string => `${view.subject.name} ${view.relation.relation} ${view.object.name}`;

/**
 * How many relationships to ask the engine for when looking up the passages
 * behind one: its most. The entity view lists only that many of an entity's
 * relationships, so a busy entity can leave this one out.
 */
const RELATION_LOOKUP_LIMIT = 50;

/** In the derivation view: the answer, the passages it was given, and its facts, so a panel can show its part in the answer. */
export interface PanelDerivation {
  answer?: string;
  evidence: ContextEvidence[];
  facts: ContextFact[];
}

interface RelationPanelProps {
  engineId: string;
  orgHandle: string;
  view: RelationView;
  /** The conflicts this relationship is one side of. */
  conflicts: ConflictView[];
  /** The two ends to ask the engine about for the passages, the one with fewer relationships first (see `RELATION_LOOKUP_LIMIT`). */
  ask: [LinkEnd, LinkEnd];
  sourceName: (sourceId: string) => string | undefined;
  derivation?: PanelDerivation;
  onSelectEntity: (name: string, kind?: string) => void;
  onSelectRecord: (id: string) => void;
  onSelectConflict: (index: number) => void;
  onClose: () => void;
}

/**
 * One relationship, selected by clicking its label on the canvas: the two
 * entities it joins, the sentence it was taken from, the passages it stands on,
 * each of which opens, and any conflict it is one side of. In the derivation
 * view it also says which passages the answer was given and which of the
 * answer's sentences cite them, as the entity panel does.
 *
 * The passages come from the engine's view of one end of the relationship, the
 * same call the entity panel makes. When neither end's view holds it, the
 * documents it was taken from are listed instead, each selectable on the graph.
 */
export function RelationPanel({ engineId, orgHandle, view, conflicts, ask, sourceName, derivation, onSelectEntity, onSelectRecord, onSelectConflict, onClose }: RelationPanelProps): JSX.Element {
  const navigate = useAppNavigate();
  const sentence = sentenceOf(view);
  const count = view.records.length;
  const isThis = (fact: ContextFact) => factIs(fact, view.subject, view.relation.relation, view.object);
  // The passages this relationship stands on in one end's view, or null when that view does not hold it.
  const behindIn = (data: ContextEntityView | undefined): ContextEvidence[] | null => {
    const fact = data?.facts.find(isThis);
    if (!data || !fact) return null;
    return fact.evidenceIds.map((id) => data.evidence.find((e) => e.id === id)).filter((e): e is ContextEvidence => !!e);
  };
  const [first, second] = ask;
  const near = useContextEntity(engineId, first.name, first.kind, RELATION_LOOKUP_LIMIT);
  const fromNear = behindIn(near.data);
  // The other end is asked only when the first one's view, read or refused, does not hold the relationship.
  const far = useContextEntity(engineId, fromNear === null && (near.isError || !!near.data) ? second.name : null, second.kind, RELATION_LOOKUP_LIMIT);
  const fromEngine = fromNear ?? behindIn(far.data) ?? [];
  // In the derivation view the answer's own facts name the passages it was given for this relationship, known at once.
  const fromAnswer = derivation
    ? derivation.facts
        .filter(isThis)
        .flatMap((fact) => fact.evidenceIds)
        .map((id) => derivation.evidence.find((e) => e.id === id))
        .filter((e): e is ContextEvidence => !!e)
    : [];
  const used = new Map(derivation?.evidence.map((e, i) => [e.id, i + 1]) ?? []);
  // Each passage once, the ones the answer was given first, in its order.
  const passages = [...new Map([...fromAnswer, ...fromEngine].map((e) => [e.id, e])).values()].sort((a, b) => (used.get(a.id) ?? Infinity) - (used.get(b.id) ?? Infinity));
  const looking = near.isLoading || far.isLoading;
  const numbers = [...new Set(passages.map((e) => used.get(e.id)).filter((n): n is number => n !== undefined))];
  const inAnswer = derivation?.answer ? [...new Set(numbers.flatMap((n) => sentencesCiting(derivation.answer, n)))] : [];
  return (
    <Box component="aside" aria-label={`Relationship: ${sentence}`} sx={panelSx(true)}>
      <PanelHeader title={view.relation.relation} caption="Relationship" color="primary.main" onClose={onClose} />

      <Box sx={{ fontSize: 14, lineHeight: 2 }}>
        <EntityChip name={view.subject.name} kind={view.subject.kind} onSelect={onSelectEntity} lit />{' '}
        <Box component="span" sx={mutedSx}>
          {view.relation.relation}
        </Box>{' '}
        <EntityChip name={view.object.name} kind={view.object.kind} onSelect={onSelectEntity} lit />
      </Box>

      {view.relation.text && (
        <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
          “{view.relation.text}”
        </Typography>
      )}
      <Typography variant="body2" sx={{ ...mutedSx, lineHeight: 1.5 }}>
        Found by the language model while the graph was built, in {count} document{count === 1 ? '' : 's'} you may read.
      </Typography>

      {/* While the passages are read, the sentences that cite them are not known yet, unless the answer's own facts named them. */}
      {derivation?.answer && (inAnswer.length > 0 || !looking) && (
        <Box>
          <Typography sx={panelLabelSx}>In this answer</Typography>
          {inAnswer.length ? (
            <Stack gap={0.75} sx={{ mt: 0.75 }}>
              {inAnswer.map((line) => (
                <Box key={line} component="span" sx={sentenceSx}>
                  {line}
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ ...mutedSx, mt: 0.5 }}>
              No sentence of the answer cites a passage this relationship stands on.
            </Typography>
          )}
        </Box>
      )}

      {passages.length > 0 ? (
        <Box>
          <Typography sx={panelLabelSx}>Found in</Typography>
          <Stack component="ul" gap={0.75} sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0 }}>
            {passages.map((ev) => (
              <PassageRow key={ev.id} evidence={ev} engineId={engineId} orgHandle={orgHandle} sourceName={sourceName(ev.sourceId)} answerNumber={used.get(ev.id)} inDerivation={!!derivation} />
            ))}
          </Stack>
        </Box>
      ) : looking ? (
        <Stack direction="row" alignItems="center" gap={1}>
          <CircularProgress size={14} />
          <Typography variant="caption" sx={mutedSx}>
            Reading the passages behind it…
          </Typography>
        </Stack>
      ) : (
        count > 0 && (
          <Box>
            <Typography sx={panelLabelSx}>Taken from</Typography>
            <Stack component="ul" gap={0.5} sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0 }}>
              {view.records.map((record) => (
                <li key={record.id}>
                  <RecordRow record={record} onSelect={onSelectRecord} />
                </li>
              ))}
            </Stack>
          </Box>
        )
      )}

      {conflicts.length > 0 && (
        <Box>
          <Typography sx={panelLabelSx}>Conflicts</Typography>
          <Stack component="ul" gap={0.75} sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0 }}>
            {conflicts.map((conflict) => {
              const other = sameRelation(conflict.first.relation, view.relation) ? conflict.second : conflict.first;
              return (
                <li key={conflict.index}>
                  <ButtonBase onClick={() => onSelectConflict(conflict.index)} disabled={!conflict.drawn} sx={{ ...selectRowSx, '&:hover': { borderColor: 'error.main' } }} aria-label={`Show the conflict with “${sentenceOf(other)}” on the graph`}>
                    <Box component="span" sx={mutedSx}>
                      Disagrees with
                    </Box>{' '}
                    <Box component="span" sx={{ color: 'error.main' }}>
                      “{sentenceOf(other)}”
                    </Box>
                    <Confidence value={conflict.confidence} />
                    {conflict.reason && (
                      <Typography variant="caption" sx={{ ...mutedSx, display: 'block', lineHeight: 1.45 }}>
                        {conflict.reason}
                      </Typography>
                    )}
                    {!conflict.drawn && (
                      <Typography variant="caption" sx={{ ...mutedSx, display: 'block', lineHeight: 1.45 }}>
                        Not drawn with the current filters
                      </Typography>
                    )}
                  </ButtonBase>
                </li>
              );
            })}
          </Stack>
        </Box>
      )}

      <Stack direction="row" flexWrap="wrap" gap={1}>
        <Button size="small" variant="text" startIcon={<MessageSquare size={15} />} onClick={() => navigate(contextEngineUrl(orgHandle, engineId, 'playground', { q: `What do the sources say about whether ${sentence}?` }))}>
          Ask about this
        </Button>
      </Stack>
    </Box>
  );
}

interface ConflictPanelProps {
  engineId: string;
  orgHandle: string;
  /** The conflicts on the selected line; two conflicts between the same two ends share one line. */
  conflicts: ConflictView[];
  onSelectEntity: (name: string, kind?: string) => void;
  onSelectRelation: (relation: ContextGraphRelation) => void;
  onClose: () => void;
}

/**
 * A conflict, selected by clicking its "contradicts" label: the two
 * relationships the engine's check says cannot both be true, each with the
 * documents behind it, the check's reason and how sure it is, and every entity
 * involved. Either side can be selected from here.
 */
export function ConflictPanel({ engineId, orgHandle, conflicts, onSelectEntity, onSelectRelation, onClose }: ConflictPanelProps): JSX.Element {
  const navigate = useAppNavigate();
  const several = conflicts.length > 1;
  const first = conflicts[0];
  return (
    <Box component="aside" aria-label="Conflict" sx={panelSx(true)}>
      <PanelHeader title="Conflict" caption={several ? `${conflicts.length} conflicts on this line` : 'Two relationships that disagree'} color="error.main" onClose={onClose} />
      <Typography variant="body2" sx={{ ...mutedSx, lineHeight: 1.5 }}>
        The engine’s contradiction check says these cannot both be true. Each side stands on documents you may read. Click a side to see that relationship.
      </Typography>

      {conflicts.map((conflict) => {
        const ends = [conflict.first.subject, conflict.first.object, conflict.second.subject, conflict.second.object];
        const involved = [...new Map(ends.map((end) => [`${end.name.toLowerCase()}\u0000${end.kind ?? ''}`, end])).values()];
        return (
          <Stack key={conflict.index} gap={1.25} sx={several ? { pt: 1.25, borderTop: '1px solid', borderColor: 'divider' } : undefined}>
            <SideRow view={conflict.first} onSelect={onSelectRelation} />
            <Typography variant="caption" sx={{ ...mutedSx, pl: 1 }}>
              disagrees with
            </Typography>
            <SideRow view={conflict.second} onSelect={onSelectRelation} />
            {(conflict.reason || conflict.confidence !== null) && (
              <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                {conflict.reason}
                <Confidence value={conflict.confidence} />
              </Typography>
            )}
            <Box>
              <Typography sx={panelLabelSx}>Entities involved</Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
                {involved.map((end) => (
                  <EntityChip key={`${end.name}|${end.kind ?? ''}`} name={end.name} kind={end.kind} onSelect={onSelectEntity} lit />
                ))}
              </Stack>
            </Box>
          </Stack>
        );
      })}

      {first && (
        <Stack direction="row" flexWrap="wrap" gap={1}>
          <Button
            size="small"
            variant="text"
            startIcon={<MessageSquare size={15} />}
            onClick={() => navigate(contextEngineUrl(orgHandle, engineId, 'playground', { q: `The sources say both “${sentenceOf(first.first)}” and “${sentenceOf(first.second)}”. Which is right?` }))}>
            Ask about this
          </Button>
        </Stack>
      )}
    </Box>
  );
}

interface LinkDetailsProps {
  engineId: string;
  orgHandle: string;
  /** The graph as drawn, and the graph served that it was drawn from. */
  model: GraphModel;
  graph: ContextGraph;
  /** The selected link: a relationship, or a conflict line. */
  link: number;
  sourceName: (sourceId: string) => string | undefined;
  /** In the derivation view: the answer's part, for the relationship panel. */
  derivation?: PanelDerivation;
  onSelectEntity: (name: string, kind?: string) => void;
  onSelectRecord: (id: string) => void;
  /** Select another link, such as one side of a conflict. */
  onSelectLink: (link: number) => void;
  onClose: () => void;
}

/**
 * The panel for a link selected by clicking its label: the relationship it
 * stands for, or the conflicts on a conflict line. The explorer and the
 * derivation view both show it, so a label works the same in both.
 */
export function LinkDetails({ engineId, orgHandle, model, graph, link, sourceName, derivation, onSelectEntity, onSelectRecord, onSelectLink, onClose }: LinkDetailsProps): JSX.Element | null {
  const line = model.links[link];
  // A document line has no label, so it is never selected.
  if (!line || line.kind === 'mentions') return null;
  const end = (id: string): LinkEnd => {
    const entity = graph.entities.find((e) => e.id === id);
    return entity ? { name: entity.name, ...(entity.kind ? { kind: entity.kind } : {}) } : { name: id };
  };
  const recordView = (id: string): LinkRecord => {
    const record = graph.records.find((r) => r.id === id);
    return { id, label: record?.recordId ?? id, sourceName: record ? sourceName(record.sourceId) : undefined, drawn: model.index.has(id) };
  };
  const relationView = (relation: ContextGraphRelation): RelationView => ({ relation, subject: end(relation.subjectId), object: end(relation.objectId), records: relation.recordNodeIds.map(recordView), drawn: relationLink(model, relation) !== undefined });
  const conflictView = ({ index, conflict }: { index: number; conflict: ContextGraphConflict }): ConflictView => ({
    index,
    first: relationView(conflict.first),
    second: relationView(conflict.second),
    reason: conflict.reason,
    confidence: conflict.confidence,
    drawn: conflictLink(model, conflict) !== undefined,
  });
  const selectRelation = (relation: ContextGraphRelation) => {
    const at = relationLink(model, relation);
    if (at !== undefined) onSelectLink(at);
  };
  const selectConflict = (index: number) => {
    const at = graph.conflicts[index] ? conflictLink(model, graph.conflicts[index]) : undefined;
    if (at !== undefined) onSelectLink(at);
  };

  if (line.kind === 'conflicts') {
    return <ConflictPanel engineId={engineId} orgHandle={orgHandle} conflicts={conflictsOn(model, graph, link).map(conflictView)} onSelectEntity={onSelectEntity} onSelectRelation={selectRelation} onClose={onClose} />;
  }
  // The relationship as the graph served it, or, when it is not found there, as the line itself names it.
  const relation = relationOf(model, graph, link) ?? { subjectId: model.nodes[line.source].key, relation: line.label ?? '', objectId: model.nodes[line.target].key, recordNodeIds: [] };
  // The engine lists a limited number of an entity's relationships, so the end with fewer of them is asked first.
  const degree = (id: string) => graph.relations.reduce((n, r) => n + (r.subjectId === id || r.objectId === id ? 1 : 0), 0);
  const ends: [LinkEnd, LinkEnd] = [end(relation.subjectId), end(relation.objectId)];
  return (
    <RelationPanel
      key={link}
      engineId={engineId}
      orgHandle={orgHandle}
      view={relationView(relation)}
      ask={degree(relation.subjectId) <= degree(relation.objectId) ? ends : [ends[1], ends[0]]}
      sourceName={sourceName}
      derivation={derivation}
      conflicts={graph.conflicts
        .map((conflict, index) => ({ index, conflict }))
        .filter(({ conflict }) => sameRelation(conflict.first, relation) || sameRelation(conflict.second, relation))
        .map(conflictView)}
      onSelectEntity={onSelectEntity}
      onSelectRecord={onSelectRecord}
      onSelectConflict={selectConflict}
      onClose={onClose}
    />
  );
}

function PanelHeader({ title, caption, color, onClose }: { title: string; caption: string; color: string; onClose: () => void }): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
      <Stack direction="row" alignItems="baseline" flexWrap="wrap" columnGap={1} sx={{ minWidth: 0 }}>
        <Box aria-hidden sx={{ width: 14, height: 3, borderRadius: 1, bgcolor: color, flexShrink: 0, alignSelf: 'center' }} />
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        <Typography variant="caption" sx={mutedSx}>
          {caption}
        </Typography>
      </Stack>
      <IconButton size="small" aria-label="Release the selection" onClick={onClose}>
        <X size={15} />
      </IconButton>
    </Stack>
  );
}

/** One side of a conflict: its sentence, clickable when its link is drawn, with the documents behind it. */
function SideRow({ view, onSelect }: { view: RelationView; onSelect: (relation: ContextGraphRelation) => void }): JSX.Element {
  const from = view.records.map((r) => r.label);
  return (
    <ButtonBase onClick={() => onSelect(view.relation)} disabled={!view.drawn} sx={{ ...selectRowSx, '&:hover': { borderColor: 'error.main' } }} aria-label={`Select the relationship “${sentenceOf(view)}”`}>
      <Box component="span" sx={{ color: 'error.main', fontWeight: 500 }}>
        “{sentenceOf(view)}”
      </Box>
      <Typography variant="caption" sx={{ ...mutedSx, display: 'block', lineHeight: 1.45 }}>
        {from.length ? `From ${from.join(', ')}` : 'From a document that is not shown'}
        {view.drawn ? '' : ' · not drawn with the current filters'}
      </Typography>
    </ButtonBase>
  );
}

/** A document behind a relationship, clickable when it is drawn. */
function RecordRow({ record, onSelect }: { record: LinkRecord; onSelect: (id: string) => void }): JSX.Element {
  return (
    <ButtonBase onClick={() => onSelect(record.id)} disabled={!record.drawn} sx={{ ...selectRowSx, display: 'flex', alignItems: 'baseline', gap: 1, py: 0.75 }} aria-label={`Select the document ${record.label}`}>
      <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: 'text.primary', flexShrink: 0, alignSelf: 'center' }} />
      <Box component="span" sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
        {record.label}
      </Box>
      {record.sourceName && (
        <Box component="span" sx={{ ...mutedSx, fontSize: 12 }}>
          {record.sourceName}
        </Box>
      )}
    </ButtonBase>
  );
}

function Confidence({ value }: { value: number | null }): ReactNode {
  if (value === null) return null;
  return (
    <Box component="span" sx={mutedSx}>
      {' '}
      · the check is {Math.round(value * 100)}% sure
    </Box>
  );
}
