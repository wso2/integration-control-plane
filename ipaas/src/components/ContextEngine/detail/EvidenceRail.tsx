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

import { Box, Button, ButtonBase, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import { Check, ChevronDown, ChevronRight, ExternalLink, History, Link as LinkIcon } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState, type JSX } from 'react';
import { absoluteUrl, evidenceVersionLabel } from '../../../utils/contextEngine';
import { EvidencePlace } from './EvidenceCard';
import { mutedSx, railCardSx, railNumberSx } from '../styles';
import type { ContextEvidence, ContextSource } from '../../../types/contextEngine';

interface RailCardProps {
  evidence: ContextEvidence;
  n: number;
  source?: ContextSource;
  cited: boolean;
  /** Its mark in the answer is hovered or focused. */
  active: boolean;
  pinned: boolean;
  /** Another passage is pinned, so this one steps back. */
  dimmed: boolean;
  href: string;
  onHover: (n: number | null) => void;
  onPin: (n: number) => void;
  onOpen: () => void;
}

function RailCard({ evidence, n, source, cited, active, pinned, dimmed, href, onHover, onPin, onOpen }: RailCardProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (pinned) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [pinned]);
  const copy = () =>
    navigator.clipboard?.writeText(absoluteUrl(href)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  return (
    <Box ref={ref} onMouseEnter={() => onHover(n)} onMouseLeave={() => onHover(null)} sx={railCardSx(active, pinned, dimmed)}>
      <Stack direction="row" alignItems="center" gap={1}>
        <ButtonBase aria-label={`${pinned ? 'Release' : 'Pin'} passage ${n}`} aria-pressed={pinned} onClick={() => onPin(n)} sx={railNumberSx(active || pinned)}>
          {n}
        </ButtonBase>
        <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 0 }} noWrap title={evidence.recordId}>
          {evidence.recordId}
        </Typography>
        {!cited && <Chip size="small" variant="outlined" label="Not cited" sx={{ ml: 'auto', height: 20, color: 'text.secondary' }} />}
      </Stack>
      <Typography variant="caption" sx={{ ...mutedSx, display: 'block', pl: 3.5, mt: 0.25 }}>
        {source?.name ?? evidence.sourceId} · <EvidencePlace evidence={evidence} showRecord={false} />
      </Typography>
      <Typography variant="body2" sx={{ pl: 3.5, mt: 1, lineHeight: 1.5, fontSize: 13, ...(pinned ? { maxHeight: 280, overflowY: 'auto', pr: 0.5 } : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
        “{evidence.passage}”
      </Typography>
      {pinned && (
        <Box sx={{ pl: 3.5 }}>
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ ...mutedSx, mt: 1.25 }}>
            <History size={13} aria-hidden />
            <Typography variant="caption">Version of {evidenceVersionLabel(evidence.sourceVersion)}</Typography>
          </Stack>
          <Stack direction="row" gap={1} sx={{ mt: 1.25 }}>
            <Button size="small" variant="outlined" startIcon={<ExternalLink size={14} />} onClick={onOpen}>
              Open passage
            </Button>
            <Button size="small" variant="text" startIcon={copied ? <Check size={14} /> : <LinkIcon size={14} />} onClick={() => void copy()}>
              {copied ? 'Link copied' : 'Copy link'}
            </Button>
          </Stack>
          <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 1 }}>
            Pinned · click the number again, or press Esc, to release
          </Typography>
        </Box>
      )}
    </Box>
  );
}

interface EvidenceRailProps {
  /** The passages the model was given, in prompt order: `[n]` is `evidence[n - 1]`. */
  evidence: ContextEvidence[];
  sources: ContextSource[];
  /** Evidence numbers the answer cites. */
  cited: Set<number>;
  active: number | null;
  pinned: number | null;
  hrefFor: (evidence: ContextEvidence) => string;
  onHover: (n: number | null) => void;
  onPin: (n: number) => void;
  onOpen: (evidence: ContextEvidence) => void;
}

/**
 * The passages beside an answer: the cited ones first, lit together with the
 * sentence that cites them, and the ones the model was given but did not cite
 * folded underneath. Those still count: the answer may draw on them, and the
 * engine checks all of them before showing the answer again.
 */
export default function EvidenceRail({ evidence, sources, cited, active, pinned, hrefFor, onHover, onPin, onOpen }: EvidenceRailProps): JSX.Element {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const uncited = evidence.map((_, i) => i + 1).filter((n) => !cited.has(n));
  const [showUncited, setShowUncited] = useState(false);
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
        cited={cited.has(n)}
        active={active === n}
        pinned={pinned === n}
        dimmed={pinned !== null && pinned !== n}
        href={hrefFor(ev)}
        onHover={onHover}
        onPin={onPin}
        onOpen={() => onOpen(ev)}
      />
    );
  };

  return (
    <Stack gap={1.25} sx={{ position: { lg: 'sticky' }, top: { lg: 16 } }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Evidence
        </Typography>
        <Typography variant="caption" sx={mutedSx}>
          Cited in the answer
        </Typography>
      </Stack>
      {evidence
        .map((_, i) => i + 1)
        .filter((n) => cited.has(n))
        .map(renderCard)}
      {uncited.length > 0 && (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.5, mt: 0.5 }}>
          <Button size="small" variant="text" color="inherit" aria-expanded={open} startIcon={open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} onClick={() => setShowUncited((v) => !v)} sx={{ color: 'text.secondary', fontWeight: 600, px: 0.5 }}>
            Also given to the model ({uncited.length})
          </Button>
          {open && (
            <Stack gap={1.25} sx={{ mt: 0.5 }}>
              <Typography variant="caption" sx={{ ...mutedSx, px: 0.5, lineHeight: 1.5 }}>
                The answer doesn&apos;t cite these, but it may still draw on them. They&apos;re part of what the engine checks before showing this answer again.
              </Typography>
              {uncited.map(renderCard)}
            </Stack>
          )}
        </Box>
      )}
    </Stack>
  );
}
