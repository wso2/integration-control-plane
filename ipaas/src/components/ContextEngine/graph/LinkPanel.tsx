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

import { Box, Button, ButtonBase, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { MessageSquare, X } from '@wso2/oxygen-ui-icons-react';
import { type JSX, type ReactNode } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { contextEngineUrl } from '../../../paths';
import { sameRelation } from '../../../utils/contextGraph';
import { EntityChip } from './EntityPanel';
import { mutedSx } from '../styles';
import { panelLabelSx, panelSx, selectRowSx } from './graphStyles';
import type { ContextGraphRelation } from '../../../types/contextEngine';

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

interface RelationPanelProps {
  engineId: string;
  orgHandle: string;
  view: RelationView;
  /** The conflicts this relationship is one side of. */
  conflicts: ConflictView[];
  onSelectEntity: (name: string, kind?: string) => void;
  onSelectRecord: (id: string) => void;
  onSelectConflict: (index: number) => void;
  onClose: () => void;
}

/**
 * One relationship, selected by clicking its label on the canvas: the two
 * entities it joins, the sentence it was taken from, the documents behind it,
 * and any conflict it is one side of. Each of those can be selected from here
 * when it is drawn.
 */
export function RelationPanel({ engineId, orgHandle, view, conflicts, onSelectEntity, onSelectRecord, onSelectConflict, onClose }: RelationPanelProps): JSX.Element {
  const navigate = useAppNavigate();
  const sentence = sentenceOf(view);
  const count = view.records.length;
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

      {count > 0 && (
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
        <Button size="small" variant="text" startIcon={<MessageSquare size={15} />} onClick={() => navigate(`${contextEngineUrl(orgHandle, engineId, 'playground')}?q=${encodeURIComponent(`What do the sources say about whether ${sentence}?`)}`)}>
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
            onClick={() => navigate(`${contextEngineUrl(orgHandle, engineId, 'playground')}?q=${encodeURIComponent(`The sources say both “${sentenceOf(first.first)}” and “${sentenceOf(first.second)}”. Which is right?`)}`)}>
            Ask about this
          </Button>
        </Stack>
      )}
    </Box>
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
