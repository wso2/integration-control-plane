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

import { Box, Button, ButtonBase, CircularProgress, IconButton, Link, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, ArrowRight, MessageSquare, Waypoints, X } from '@wso2/oxygen-ui-icons-react';
import { type JSX } from 'react';
import { useContextEntity } from '../../../hooks/useContextEngine';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { contextEngineUrl, contextEvidenceUrl } from '../../../paths';
import { HttpError } from '../../../types/http';
import { sentencesCiting, type EntityConflict } from '../../../utils/contextGraph';
import { isOpaqueRecordId, restoreCase, tidyPassage } from '../../../utils/contextEngine';
import { EvidencePlace } from '../detail/EvidenceCard';
import { mutedSx } from '../styles';
import { panelSx, panelLabelSx, selectRowSx, sentenceSx } from './graphStyles';
import type { ContextEvidence, ContextSource } from '../../../types/contextEngine';

interface PassageRowProps {
  evidence: ContextEvidence;
  engineId: string;
  orgHandle: string;
  sourceName?: string;
  /** Its number among the passages the answer was given, when it was one of them. */
  answerNumber?: number;
  /** In the derivation view the row says whether the answer was given this passage; elsewhere it shows the start of its text. */
  inDerivation: boolean;
}

/** One passage in a side panel: its document, where in it the passage sits, and a link that opens the passage. */
export function PassageRow({ evidence: ev, engineId, orgHandle, sourceName, answerNumber: n, inDerivation }: PassageRowProps): JSX.Element {
  const navigate = useAppNavigate();
  const href = contextEvidenceUrl(orgHandle, engineId, ev.id);
  // A record id that is only a storage key (a Drive file id, say) means nothing to a reader: the source's name stands in for it.
  const opaque = isOpaqueRecordId(ev.recordId);
  const title = opaque ? (sourceName ?? ev.recordId) : ev.recordId;
  return (
    <Box component="li" sx={{ p: 1.25, borderRadius: 1, border: '1px solid', borderColor: n ? 'primary.light' : 'divider', bgcolor: n ? 'action.hover' : 'transparent' }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1}>
        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }} noWrap title={title}>
          {title}
        </Typography>
        <Button size="small" variant="text" href={href} onClick={(e) => (e.preventDefault(), navigate(href))} sx={{ minWidth: 0, px: 0.5, flexShrink: 0 }}>
          Open
        </Button>
      </Stack>
      <Typography variant="caption" sx={{ ...mutedSx, display: 'block' }}>
        {opaque ? null : `${sourceName ?? ev.sourceId} · `}
        <EvidencePlace evidence={ev} showRecord={false} />
      </Typography>
      {inDerivation ? (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: n ? 'primary.main' : 'text.secondary' }}>
          {n ? `Passage ${n} of this answer` : 'Not retrieved for this question'}
        </Typography>
      ) : (
        <Typography variant="body2" sx={{ mt: 0.5, fontSize: 13, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          “{tidyPassage(ev.passage)}”
        </Typography>
      )}
    </Box>
  );
}

interface EntityPanelProps {
  engineId: string;
  orgHandle: string;
  name: string;
  /** The entity's kind, when the caller knows it: the same name can be more than one entity, one per kind. */
  kind?: string;
  /** The colour the graph draws this entity's kind in, for the dot beside its name; the accent when it has none. */
  kindColor?: string;
  /** Conflicts the graph view holds in which this entity takes part, from the engine's contradiction check. */
  conflicts?: EntityConflict[];
  sources: ContextSource[];
  /** In provenance mode: the answer and the passages its query returned, to show this entity's part in it. */
  derivation?: { answer?: string; evidence: ContextEvidence[] };
  /** Open another entity; its kind comes along when the fact that named it carries one. */
  onSelectEntity: (name: string, kind?: string) => void;
  /** Select a conflict on the canvas, by its place in the graph's list; without it the conflicts are only read. */
  onSelectConflict?: (index: number) => void;
  onClose: () => void;
  /** Provenance mode: leave the derivation and explore around this entity. */
  onExplore?: () => void;
}

/**
 * One entity, as the engine's graph holds it for the reader: the passages that
 * name it, and its relationships, each standing on passages the reader may
 * read. In provenance mode it also says which answer sentences depend on it
 * and which of its passages the question did not retrieve.
 */
export default function EntityPanel({ engineId, orgHandle, name, kind, kindColor, conflicts = [], sources, derivation, onSelectEntity, onSelectConflict, onClose, onExplore }: EntityPanelProps): JSX.Element {
  const navigate = useAppNavigate();
  const entity = useContextEntity(engineId, name, kind);
  const view = entity.data;
  const byId = new Map(view?.evidence.map((e) => [e.id, e]) ?? []);
  const sourceName = new Map(sources.map((s) => [s.id, s.name]));
  const used = new Map(derivation?.evidence.map((e, i) => [e.id, i + 1]) ?? []);
  const mentioned = (view?.mentionedIn ?? []).map((id) => byId.get(id)).filter((e): e is ContextEvidence => !!e);
  const records = new Set(mentioned.map((e) => `${e.sourceId}\u0000${e.recordId}`));
  // The answer's sentences that cite a passage naming this entity or standing behind one of its relationships.
  const behind = new Set([...(view?.mentionedIn ?? []), ...(view?.facts.flatMap((f) => f.evidenceIds) ?? [])]);
  const numbers = [...behind]
    .map((id) => used.get(id))
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b);
  const inAnswer = derivation?.answer ? [...new Set(numbers.flatMap((n) => sentencesCiting(derivation.answer, n)))] : [];
  const notFound = entity.error instanceof HttpError && entity.error.status === 404;
  // The kind the caller picked wins; otherwise the kind the engine opened.
  const shownKind = kind ?? view?.entity.kind;
  // This entity's own name, by name and, when both sides know one, by kind: the same name can be another entity of another kind.
  const mine = (other: string, otherKind?: string) => other.toLowerCase() === name.toLowerCase() && (!kind || !otherKind || otherKind === kind);
  // Names as the passages write them: the engine keeps them in lower case.
  const passages = mentioned.map((e) => e.passage);
  const shownName = restoreCase(name, passages);
  // Relationships grouped by verb and side, so a verb several entities share with this one reads once:
  // "→ generates" lists what this entity points at, "← knows app" what points at it, as the canvas arrows do.
  const groups = new Map<string, { relation: string; incoming: boolean; others: Map<string, { name: string; kind?: string; text?: string }> }>();
  for (const fact of view?.facts ?? []) {
    const incoming = !mine(fact.subject, fact.subjectKind) && mine(fact.object, fact.objectKind);
    const [other, otherKind] = incoming ? [fact.subject, fact.subjectKind] : [fact.object, fact.objectKind];
    const key = `${incoming ? 'in' : 'out'}\u0000${fact.relation}`;
    const group = groups.get(key) ?? { relation: fact.relation, incoming, others: new Map() };
    group.others.set(`${other.toLowerCase()}\u0000${otherKind ?? ''}`, { name: other, kind: otherKind, text: fact.text ?? undefined });
    groups.set(key, group);
  }

  return (
    <Box component="aside" aria-label={`Entity ${name}`} sx={panelSx(true)}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Stack direction="row" alignItems="baseline" flexWrap="wrap" columnGap={1} sx={{ minWidth: 0 }}>
          <Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: kindColor ?? 'text.secondary', flexShrink: 0, alignSelf: 'center' }} />
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
            {shownName}
          </Typography>
          <Typography variant="caption" sx={mutedSx}>
            {shownKind ? shownKind.charAt(0).toUpperCase() + shownKind.slice(1) : 'Entity'}
          </Typography>
        </Stack>
        <IconButton size="small" aria-label="Release the selection" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </Stack>

      {entity.isLoading && (
        <Stack direction="row" alignItems="center" gap={1}>
          <CircularProgress size={14} />
          <Typography variant="caption" sx={mutedSx}>
            Reading where it is mentioned…
          </Typography>
        </Stack>
      )}
      {notFound && (
        <Typography variant="body2" sx={mutedSx}>
          Nothing you can read names this entity.
        </Typography>
      )}
      {entity.isError && !notFound && (
        <Typography variant="body2" color="error">
          Couldn’t read this entity. Please try again.
        </Typography>
      )}

      {view && (
        <>
          {/* Hidden on the provenance page; the explorer, which passes no derivation, still shows it. */}
          {!derivation && (
            <Typography variant="body2" sx={{ ...mutedSx, lineHeight: 1.5 }}>
              Mentioned in {mentioned.length} passage{mentioned.length === 1 ? '' : 's'} across {records.size} document{records.size === 1 ? '' : 's'}.
            </Typography>
          )}

          {derivation?.answer && (
            <Box>
              <Typography sx={panelLabelSx}>In this answer</Typography>
              {inAnswer.length ? (
                <Stack gap={0.75} sx={{ mt: 0.75 }}>
                  {inAnswer.map((sentence) => (
                    <Box key={sentence} component="span" sx={sentenceSx}>
                      {sentence}
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" sx={{ ...mutedSx, mt: 0.5 }}>
                  No sentence of the answer cites a passage that names it.
                </Typography>
              )}
            </Box>
          )}

          <Box>
            <Typography sx={panelLabelSx}>Mentioned in</Typography>
            <Stack component="ul" gap={0.75} sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0 }}>
              {mentioned.map((ev) => (
                <PassageRow key={ev.id} evidence={ev} engineId={engineId} orgHandle={orgHandle} sourceName={sourceName.get(ev.sourceId)} answerNumber={used.get(ev.id)} inDerivation={!!derivation} />
              ))}
              {!mentioned.length && (
                <Typography variant="body2" component="li" sx={mutedSx}>
                  No passage you can read names it directly.
                </Typography>
              )}
            </Stack>
          </Box>

          {groups.size > 0 && (
            <Box>
              <Typography sx={panelLabelSx}>Relationships</Typography>
              <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)', columnGap: 1.5, rowGap: 0.75, m: 0, mt: 0.75, fontSize: 13, lineHeight: 1.5 }}>
                {[...groups.entries()].map(([key, group]) => {
                  const others = [...group.others.values()];
                  const listed = others.map((o) => restoreCase(o.name, passages)).join(', ');
                  return (
                    <Box key={key} sx={{ display: 'contents' }}>
                      <Box component="dt" sx={{ ...mutedSx, display: 'flex', alignItems: 'center', alignSelf: 'start', gap: 0.5 }} title={group.incoming ? `${listed} ${group.relation} ${shownName}` : `${shownName} ${group.relation} ${listed}`}>
                        {group.incoming ? <ArrowLeft size={13} aria-label="Points at this:" /> : <ArrowRight size={13} aria-label="This points at:" />}
                        {group.relation}
                      </Box>
                      <Box component="dd" sx={{ m: 0, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
                        {/* One per line: a button cannot wrap like text, so a comma list breaks apart on long names. */}
                        {others.map((o) => (
                          <Link
                            key={`${o.name}|${o.kind ?? ''}`}
                            component="button"
                            type="button"
                            underline="hover"
                            title={o.text ? `“${o.text}”` : undefined}
                            onClick={() => onSelectEntity(o.name, o.kind)}
                            sx={{ fontSize: 13, fontWeight: 500, textAlign: 'left' }}>
                            {restoreCase(o.name, passages)}
                          </Link>
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {conflicts.length > 0 && (
            <Box>
              <Typography sx={panelLabelSx}>Conflicts</Typography>
              <Stack component="ul" gap={0.75} sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0 }}>
                {conflicts.map((c) => {
                  const body = (
                    <>
                      <Box component="span" sx={{ color: 'error.main' }}>
                        “{c.first}”
                      </Box>{' '}
                      <Box component="span" sx={mutedSx}>
                        disagrees with
                      </Box>{' '}
                      <Box component="span" sx={{ color: 'error.main' }}>
                        “{c.second}”
                      </Box>
                      {c.confidence !== null && (
                        <Box component="span" sx={mutedSx}>
                          {' '}
                          · {Math.round(c.confidence * 100)}% sure
                        </Box>
                      )}
                      {c.reason && (
                        <Typography variant="caption" sx={{ ...mutedSx, display: 'block', lineHeight: 1.45 }}>
                          {c.reason}
                        </Typography>
                      )}
                      {onSelectConflict && c.drawn === false && (
                        <Typography variant="caption" sx={{ ...mutedSx, display: 'block', lineHeight: 1.45 }}>
                          Not drawn with the current filters
                        </Typography>
                      )}
                    </>
                  );
                  return (
                    <Box component="li" key={c.index} sx={{ fontSize: 13, lineHeight: 1.5 }}>
                      {/* With a handler, the conflict can be selected on the canvas, where both of its sides light up; not when its line is not drawn. */}
                      {onSelectConflict ? (
                        <ButtonBase onClick={() => onSelectConflict(c.index)} disabled={c.drawn === false} sx={{ ...selectRowSx, '&:hover': { borderColor: 'error.main' } }} aria-label="Show this conflict on the graph">
                          {body}
                        </ButtonBase>
                      ) : (
                        body
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}
        </>
      )}

      <Stack direction="row" flexWrap="wrap" gap={1}>
        {onExplore && (
          <Button size="small" variant="outlined" startIcon={<Waypoints size={15} />} onClick={onExplore}>
            Explore neighbours
          </Button>
        )}
        <Button size="small" variant="text" startIcon={<MessageSquare size={15} />} onClick={() => navigate(contextEngineUrl(orgHandle, engineId, 'playground', { q: `What do the sources say about ${name}?` }))}>
          Ask about this
        </Button>
      </Stack>
    </Box>
  );
}

/** A clickable entity name, to move the selection along a relationship. A long name is cut to one line and shown whole on hover. */
export function EntityChip({ name, kind, onSelect, lit = false }: { name: string; kind?: string; onSelect: (name: string, kind?: string) => void; lit?: boolean }): JSX.Element {
  return (
    <Tooltip title={name}>
      <ButtonBase
        onClick={() => onSelect(name, kind)}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          height: 24,
          maxWidth: '100%',
          minWidth: 0,
          px: 1,
          borderRadius: 12,
          border: '1px solid',
          borderColor: lit ? 'primary.main' : 'divider',
          bgcolor: 'background.paper',
          fontSize: 12,
          color: 'text.primary',
          verticalAlign: 'middle',
          '&:hover': { borderColor: 'primary.main' },
        }}>
        <Box aria-hidden sx={{ width: 7, height: 7, flexShrink: 0, borderRadius: '50%', bgcolor: lit ? 'primary.main' : 'text.disabled' }} />
        <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </Box>
      </ButtonBase>
    </Tooltip>
  );
}
