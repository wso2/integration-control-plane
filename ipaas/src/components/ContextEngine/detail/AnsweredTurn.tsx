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

import { Box, Button, Typography } from '@wso2/oxygen-ui';
import { ArrowRight, Waypoints } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import { citedNumbers } from '../../../utils/contextEngine';
import { derivationSummary } from '../../../utils/contextGraph';
import CitedAnswer, { type CitationFocus } from './CitedAnswer';
import EvidenceRail from './EvidenceRail';
import type { ContextEvidence, ContextFact, ContextSource } from '../../../types/contextEngine';

interface AnsweredTurnProps {
  answer: string;
  /** The passages the model was given, in prompt order: `[n]` is `evidence[n - 1]`. */
  evidence: ContextEvidence[];
  sources: ContextSource[];
  /** Graph mode: the relationships that stand on `evidence`, counted under the answer. */
  facts?: ContextFact[];
  hrefFor: (evidence: ContextEvidence) => string;
  onOpen: (evidence: ContextEvidence) => void;
  /** The Graph tab URL that shows how the answer was derived; with a passage, that passage opens chosen. */
  derivationHref?: (evidence?: ContextEvidence) => string;
  /** Open the answer's derivation in the Graph tab, optionally with one passage chosen. */
  onShowDerivation?: (evidence?: ContextEvidence) => void;
}

/**
 * An answer beside its evidence. Pointing at a citation in the answer, or at a
 * passage in the rail, lights both ends of the link; clicking either pins it
 * until it is clicked again or Esc is pressed. On narrow screens the rail
 * follows the answer instead of sitting beside it.
 */
export default function AnsweredTurn({ answer, evidence, sources, facts = [], hrefFor, onOpen, derivationHref, onShowDerivation }: AnsweredTurnProps): JSX.Element {
  const [active, setActive] = useState<CitationFocus | null>(null);
  const [pinned, setPinned] = useState<CitationFocus | null>(null);
  const cited = citedNumbers(answer, evidence.length);

  useEffect(() => {
    if (!pinned) return;
    const release = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(null);
    };
    window.addEventListener('keydown', release);
    return () => window.removeEventListener('keydown', release);
  }, [pinned]);

  const togglePin = (focus: CitationFocus) => setPinned((prev) => (prev && prev.n === focus.n && prev.sentence === focus.sentence ? null : focus));

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 330px' }, gap: 3, alignItems: 'start' }}>
      <Box sx={{ minWidth: 0 }}>
        <CitedAnswer answer={answer} passages={evidence.length} active={active} pinned={pinned} onHover={setActive} onPin={togglePin} />
        {derivationHref && <DerivationLine answer={answer} evidence={evidence} facts={facts} href={derivationHref()} />}
      </Box>
      <EvidenceRail
        evidence={evidence}
        sources={sources}
        cited={cited}
        active={active?.n ?? null}
        pinned={pinned?.n ?? null}
        hrefFor={hrefFor}
        onHover={(n) => setActive(n === null ? null : { n })}
        onPin={(n) => togglePin({ n })}
        onOpen={onOpen}
        onShowInGraph={onShowDerivation}
      />
    </Box>
  );
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Under an answer: what it was built from, and a link to its derivation in the Graph tab. */
function DerivationLine({ answer, evidence, facts, href }: { answer: string; evidence: ContextEvidence[]; facts: ContextFact[]; href: string }): JSX.Element {
  const s = derivationSummary({ answer, evidence, facts });
  const parts = [count(s.sentences, 'sentence', 'sentences'), count(s.passages, 'passage', 'passages'), ...(s.entities ? [count(s.entities, 'entity', 'entities')] : [])];
  return (
    <Box sx={{ mt: 2.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
      <Waypoints size={16} aria-hidden />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12.5 }}>
        {parts.join(', ')}.
      </Typography>
      <Button size="small" variant="text" component={RouterLink} to={href} endIcon={<ArrowRight size={14} />} sx={{ fontWeight: 600, px: 0.5 }}>
        How this answer was derived
      </Button>
    </Box>
  );
}
