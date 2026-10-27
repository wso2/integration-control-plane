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
import { MessageSquare, Waypoints, X } from '@wso2/oxygen-ui-icons-react';
import { type JSX } from 'react';
import { useContextEntity } from '../../../hooks/useContextEngine';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { contextEngineUrl, contextEvidenceUrl } from '../../../paths';
import { HttpError } from '../../../types/http';
import { sentencesCiting } from '../../../utils/contextGraph';
import { EvidencePlace } from '../detail/EvidenceCard';
import { mutedSx } from '../styles';
import { panelSx, panelLabelSx, sentenceSx } from './graphStyles';
import type { ContextEvidence, ContextSource } from '../../../types/contextEngine';

interface EntityPanelProps {
  engineId: string;
  orgHandle: string;
  name: string;
  sources: ContextSource[];
  /** In provenance mode: the answer and the passages its query returned, to show this entity's part in it. */
  derivation?: { answer?: string; evidence: ContextEvidence[] };
  onSelectEntity: (name: string) => void;
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
export default function EntityPanel({ engineId, orgHandle, name, sources, derivation, onSelectEntity, onClose, onExplore }: EntityPanelProps): JSX.Element {
  const navigate = useAppNavigate();
  const entity = useContextEntity(engineId, name);
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
  const related = [...new Set(view?.facts.flatMap((f) => [f.subject, f.object]).filter((n) => n.toLowerCase() !== name.toLowerCase()) ?? [])];

  return (
    <Box component="aside" aria-label={`Entity ${name}`} sx={panelSx(true)}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Stack direction="row" alignItems="baseline" flexWrap="wrap" columnGap={1} sx={{ minWidth: 0 }}>
          <Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0, alignSelf: 'center' }} />
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
            {name}
          </Typography>
          <Typography variant="caption" sx={mutedSx}>
            Entity{view?.entity.kind ? ` · ${view.entity.kind}` : ''}
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
          <Typography variant="body2" sx={{ ...mutedSx, lineHeight: 1.5 }}>
            Found by the language model while the graph was built. Mentioned in {mentioned.length} passage{mentioned.length === 1 ? '' : 's'} across {records.size} document{records.size === 1 ? '' : 's'}.
          </Typography>

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
              {mentioned.map((ev) => {
                const n = used.get(ev.id);
                return (
                  <Box component="li" key={ev.id} sx={{ p: 1.25, borderRadius: 1, border: '1px solid', borderColor: n ? 'primary.light' : 'divider', bgcolor: n ? 'action.hover' : 'transparent' }}>
                    <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1}>
                      <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }} noWrap title={ev.recordId}>
                        {ev.recordId}
                      </Typography>
                      <Button size="small" variant="text" href={contextEvidenceUrl(orgHandle, engineId, ev.id)} onClick={(e) => (e.preventDefault(), navigate(contextEvidenceUrl(orgHandle, engineId, ev.id)))} sx={{ minWidth: 0, px: 0.5, flexShrink: 0 }}>
                        Open
                      </Button>
                    </Stack>
                    <Typography variant="caption" sx={{ ...mutedSx, display: 'block' }}>
                      {sourceName.get(ev.sourceId) ?? ev.sourceId} · <EvidencePlace evidence={ev} showRecord={false} />
                    </Typography>
                    {derivation ? (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: n ? 'primary.main' : 'text.secondary' }}>
                        {n ? `Passage ${n} of this answer` : 'Not retrieved for this question'}
                      </Typography>
                    ) : (
                      <Typography variant="body2" sx={{ mt: 0.5, fontSize: 13, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        “{ev.passage}”
                      </Typography>
                    )}
                  </Box>
                );
              })}
              {!mentioned.length && (
                <Typography variant="body2" component="li" sx={mutedSx}>
                  No passage you can read names it directly.
                </Typography>
              )}
            </Stack>
          </Box>

          {view.facts.length > 0 && (
            <Box>
              <Typography sx={panelLabelSx}>Relationships</Typography>
              <Stack component="ul" gap={0.5} sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0 }}>
                {view.facts.map((fact) => {
                  const other = fact.subject.toLowerCase() === name.toLowerCase() ? fact.object : fact.subject;
                  return (
                    <Box component="li" key={`${fact.subject}|${fact.relation}|${fact.object}`} sx={{ fontSize: 13, lineHeight: 1.5 }}>
                      <span>{fact.subject.toLowerCase() === name.toLowerCase() ? name : <EntityChip name={other} onSelect={onSelectEntity} />}</span>{' '}
                      <Box component="span" sx={mutedSx}>
                        {fact.relation}
                      </Box>{' '}
                      <span>{fact.object.toLowerCase() === name.toLowerCase() ? name : <EntityChip name={other} onSelect={onSelectEntity} />}</span>
                      {fact.text && (
                        <Typography variant="caption" sx={{ ...mutedSx, display: 'block', lineHeight: 1.45 }}>
                          “{fact.text}”
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}

          {related.length > 0 && (
            <Box>
              <Typography sx={panelLabelSx}>Related entities</Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
                {related.map((other) => (
                  <EntityChip key={other} name={other} onSelect={onSelectEntity} />
                ))}
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
        <Button size="small" variant="text" startIcon={<MessageSquare size={15} />} onClick={() => navigate(`${contextEngineUrl(orgHandle, engineId, 'playground')}?q=${encodeURIComponent(`What do the sources say about ${name}?`)}`)}>
          Ask about this
        </Button>
      </Stack>
    </Box>
  );
}

/** A clickable entity name, to move the selection along a relationship. */
export function EntityChip({ name, onSelect, lit = false }: { name: string; onSelect: (name: string) => void; lit?: boolean }): JSX.Element {
  return (
    <ButtonBase
      onClick={() => onSelect(name)}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 24,
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
      <Box aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: lit ? 'primary.main' : 'text.disabled' }} />
      {name}
    </ButtonBase>
  );
}
