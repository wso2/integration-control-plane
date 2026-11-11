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

import { Box, Button, ButtonBase, Chip, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { /* Check, */ ChevronDown, ChevronRight, ExternalLink, History, X /* , Link as LinkIcon, Waypoints */ } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState, type JSX } from 'react';
// import { Link as RouterLink } from 'react-router';
import { /* absoluteUrl, */ isOpaqueRecordId, passageExcerpt, queryTerms, VERSION_HINT, versionFromLabel } from '../../../utils/contextEngine';
import PassageText from './PassageText';
import { EvidencePlace } from './EvidenceCard';
import { mutedSx, railCardSx, railNumberSx } from '../styles';
import type { ContextEvidence, ContextSource } from '../../../types/contextEngine';

interface RailCardProps {
  evidence: ContextEvidence;
  n: number;
  source?: ContextSource;
  cited: boolean;
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

function RailCard({ evidence, n, source, cited, active, pinned, dimmed, /* href, */ onHover, onPin, onOpen /* , graphHref */, terms }: RailCardProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const opaque = isOpaqueRecordId(evidence.recordId);
  useEffect(() => {
    if (pinned) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [pinned]);
  return (
    <Box ref={ref} onMouseEnter={() => onHover(n)} onMouseLeave={() => onHover(null)} sx={railCardSx(active, pinned, dimmed)}>
      <Stack direction="row" alignItems="center" gap={1}>
        <ButtonBase aria-label={`${pinned ? 'Release' : 'Pin'} passage ${n}`} aria-pressed={pinned} onClick={() => onPin(n)} sx={railNumberSx(active || pinned)}>
          {n}
        </ButtonBase>
        {/* An opaque record id (a Drive file id) names nothing; the source name stands in until the engine has item names. */}
        <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 0 }} noWrap title={evidence.recordId}>
          {opaque ? (source?.name ?? evidence.sourceId) : evidence.recordId}
        </Typography>
        {!cited && <Chip size="small" variant="outlined" label="Not cited" sx={{ ml: 'auto', height: 20, color: 'text.secondary' }} />}
        {pinned && (
          <Tooltip title="Release (Esc)">
            <IconButton size="small" aria-label="Close pinned passage" onClick={() => onPin(n)} sx={{ ml: cited ? 'auto' : 0, p: 0.25 }}>
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
            <Button size="small" variant="outlined" startIcon={<ExternalLink size={14} />} onClick={onOpen}>
              Open
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

/** Passages shown before Show all. */
const RAIL_PREVIEW = 3;

interface EvidenceRailProps {
  /** The passages the model was given, in prompt order: `[n]` is `evidence[n - 1]`. */
  evidence: ContextEvidence[];
  sources: ContextSource[];
  /** Evidence numbers the answer cites; absent beside graph facts, where every passage was returned and none is cited. */
  cited?: Set<number>;
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

/**
 * The passages beside an answer: the cited ones first, lit together with the
 * sentence that cites them, and the ones the model was given but did not cite
 * folded underneath. Those still count: the answer may draw on them, and the
 * engine checks all of them before showing the answer again. Beside graph
 * facts, with no answer, every passage is listed in the order it came back.
 */
export default function EvidenceRail({ evidence, sources, cited, active, pinned, hrefFor, onHover, onPin, onOpen, graphHrefFor, question = '' }: EvidenceRailProps): JSX.Element {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const terms = queryTerms(question);
  const uncited = cited ? evidence.map((_, i) => i + 1).filter((n) => !cited.has(n)) : [];
  const [showUncited, setShowUncited] = useState(false);
  const listed = evidence.map((_, i) => i + 1).filter((n) => !cited || cited.has(n));
  // A long list collapses so it does not run far past the facts or answer beside it; a pinned passage stays reachable.
  const [showAllState, setShowAll] = useState(false);
  const showAll = showAllState || (pinned !== null && listed.indexOf(pinned) >= RAIL_PREVIEW);
  // Pinning an uncited passage from the answer cannot happen, but hovering its card can; keep it reachable.
  const open = showUncited || (pinned !== null && uncited.includes(pinned));

  const renderCard = (n: number) => {
    const ev = evidence[n - 1];
    return (
      <RailCard
        key={ev.id}
        evidence={ev}
        n={n}
        source={byId.get(ev.sourceId)}
        cited={!cited || cited.has(n)}
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
          Passages
        </Typography>
        <Typography variant="caption" sx={{ ...mutedSx, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          {cited ? 'Cited in the answer' : 'Best match first'}
          {/* See in graph, hidden for now.
          {graphHrefFor && (
            <>
              <span aria-hidden>·</span>
              <Button size="small" variant="text" component={RouterLink} to={graphHrefFor()} startIcon={<Waypoints size={12} />} sx={{ minWidth: 0, p: 0, fontSize: 11.5, fontWeight: 600, '& .MuiButton-startIcon': { mr: 0.5 } }}>
                See in graph
              </Button>
            </>
          )}
          */}
        </Typography>
      </Stack>
      {listed.slice(0, showAll ? listed.length : RAIL_PREVIEW).map(renderCard)}
      {listed.length > RAIL_PREVIEW && (
        <Button size="small" variant="text" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} sx={{ alignSelf: 'flex-start' }}>
          {showAll ? 'Show fewer' : `Show all ${listed.length} passages`}
        </Button>
      )}
      {uncited.length > 0 && (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.5, mt: 0.5 }}>
          <Button size="small" variant="text" color="inherit" aria-expanded={open} startIcon={open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} onClick={() => setShowUncited((v) => !v)} sx={{ color: 'text.secondary', fontWeight: 600, px: 0.5 }}>
            Also given to the model ({uncited.length})
          </Button>
          {open && (
            <Stack gap={1.25} sx={{ mt: 0.5 }}>
              {uncited.map(renderCard)}
            </Stack>
          )}
        </Box>
      )}
    </Stack>
  );
}
