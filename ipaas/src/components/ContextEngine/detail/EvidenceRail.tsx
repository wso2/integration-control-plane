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

import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { /* Check, */ ExternalLink, History, /* Link as LinkIcon, */ Waypoints, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState, type JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import { /* absoluteUrl, */ isOpaqueRecordId, passageExcerpt, queryTerms, VERSION_HINT, versionFromLabel } from '../../../utils/contextEngine';
import PassageText from './PassageText';
import { EvidencePlace } from './EvidenceCard';
import { mutedSx, railCardSx, railNumberSx } from '../styles';
import type { ContextEvidence, ContextSource } from '../../../types/contextEngine';

interface RailCardProps {
  evidence: ContextEvidence;
  n: number;
  source?: ContextSource;
  /** Its mark in the answer, or beside a graph fact, is hovered or focused. */
  active: boolean;
  pinned: boolean;
  /** Another passage is pinned, so this one steps back. */
  dimmed: boolean;
  href: string;
  onHover: (n: number | null) => void;
  onPin: (n: number) => void;
  onOpen: () => void;
  /** The Graph tab URL that shows the answer's derivation with this passage chosen. */
  graphHref?: string;
  /** The question's words, shown in bold in the excerpt. */
  terms: string[];
}

function RailCard({ evidence, n, source, active, pinned, dimmed, /* href, */ onHover, onPin, onOpen, graphHref, terms }: RailCardProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const opaque = isOpaqueRecordId(evidence.recordId);
  useEffect(() => {
    if (pinned) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [pinned]);
  return (
    // The whole card pins and releases the evidence, so a click anywhere on it opens more of the text.
    <Box
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`${pinned ? 'Release' : 'Pin'} evidence ${n}`}
      aria-pressed={pinned}
      onClick={() => onPin(n)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onPin(n);
      }}
      onMouseEnter={() => onHover(n)}
      onMouseLeave={() => onHover(null)}
      sx={{ ...railCardSx(active, pinned, dimmed), cursor: 'pointer' }}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Box component="span" aria-hidden sx={railNumberSx(active || pinned)}>
          {n}
        </Box>
        {/* An opaque record id (a Drive file id) names nothing; the source name stands in until the engine has item names. */}
        <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 0 }} noWrap title={evidence.recordId}>
          {opaque ? (source?.name ?? evidence.sourceId) : evidence.recordId}
        </Typography>
        {pinned && (
          <Tooltip title="Release (Esc)">
            <IconButton
              size="small"
              aria-label="Close pinned evidence"
              onClick={(e) => {
                e.stopPropagation();
                onPin(n);
              }}
              sx={{ ml: 'auto', p: 0.25 }}>
              <X size={14} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Typography variant="caption" sx={{ ...mutedSx, display: 'block', pl: 3.5, mt: 0.25 }}>
        {opaque ? null : <>{source?.name ?? evidence.sourceId} · </>}
        <EvidencePlace evidence={evidence} showRecord={false} />
        {/* Pinned, the version joins the place line instead of taking a line of its own. */}
        {pinned && (
          <Tooltip title={VERSION_HINT}>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
              · <History size={12} aria-hidden /> {versionFromLabel(evidence.sourceVersion)}
            </Box>
          </Tooltip>
        )}
      </Typography>
      {/* Pinned shows more of the passage without a scroll area inside the page; Open has the whole of it. */}
      <Typography variant="body2" sx={{ pl: 3.5, mt: 1, lineHeight: 1.5, fontSize: 13, display: '-webkit-box', WebkitLineClamp: pinned ? 8 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        “<PassageText text={passageExcerpt(evidence.passage, terms)} terms={terms} />”
      </Typography>
      {pinned && (
        <Box sx={{ pl: 3.5 }}>
          <Stack direction="row" gap={1} sx={{ mt: 1.25 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ExternalLink size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}>
              Open
            </Button>
            {graphHref && (
              <Button size="small" variant="text" component={RouterLink} to={graphHref} startIcon={<Waypoints size={14} />}>
                In graph
              </Button>
            )}
          </Stack>
        </Box>
      )}
    </Box>
  );
}

/** Passages shown before Show all. */
const RAIL_PREVIEW = 3;

interface EvidenceRailProps {
  /** The passages the query returned, best match first. */
  evidence: ContextEvidence[];
  sources: ContextSource[];
  active: number | null;
  pinned: number | null;
  hrefFor: (evidence: ContextEvidence) => string;
  onHover: (n: number | null) => void;
  onPin: (n: number) => void;
  onOpen: (evidence: ContextEvidence) => void;
  /** The Graph tab URL that shows the answer's derivation; with a passage, that passage opens chosen. */
  graphHrefFor?: (evidence?: ContextEvidence) => string;
  /** The question asked, so its words can be found and shown in bold. */
  question?: string;
}

/** The passages beside graph facts, every one listed in the order it came back. */
export default function EvidenceRail({ evidence, sources, active, pinned, hrefFor, onHover, onPin, onOpen, graphHrefFor, question = '' }: EvidenceRailProps): JSX.Element {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const terms = queryTerms(question);
  const listed = evidence.map((_, i) => i + 1);
  // A long list collapses so it does not run far past the facts or answer beside it; a pinned passage stays reachable.
  const [showAllState, setShowAll] = useState(false);
  const showAll = showAllState || (pinned !== null && listed.indexOf(pinned) >= RAIL_PREVIEW);

  const renderCard = (n: number) => {
    const ev = evidence[n - 1];
    return (
      <RailCard
        key={ev.id}
        evidence={ev}
        n={n}
        source={byId.get(ev.sourceId)}
        active={active === n}
        pinned={pinned === n}
        dimmed={pinned !== null && pinned !== n}
        href={hrefFor(ev)}
        onHover={onHover}
        onPin={onPin}
        onOpen={() => onOpen(ev)}
        graphHref={graphHrefFor?.(ev)}
        terms={terms}
      />
    );
  };

  return (
    <Stack gap={1.25} sx={{ position: { lg: 'sticky' }, top: { lg: 16 } }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Evidence
        </Typography>
        <Typography variant="caption" sx={{ ...mutedSx, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          Best match first
          {graphHrefFor && (
            <>
              <span aria-hidden>·</span>
              <Button size="small" variant="text" component={RouterLink} to={graphHrefFor()} startIcon={<Waypoints size={12} />} sx={{ minWidth: 0, p: 0, fontSize: 11.5, fontWeight: 600, '& .MuiButton-startIcon': { mr: 0.5 } }}>
                See in graph
              </Button>
            </>
          )}
        </Typography>
      </Stack>
      {listed.slice(0, showAll ? listed.length : RAIL_PREVIEW).map(renderCard)}
      {listed.length > RAIL_PREVIEW && (
        <Button size="small" variant="text" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} sx={{ alignSelf: 'flex-start' }}>
          {showAll ? 'Show fewer' : `Show all ${listed.length} evidence`}
        </Button>
      )}
    </Stack>
  );
}
