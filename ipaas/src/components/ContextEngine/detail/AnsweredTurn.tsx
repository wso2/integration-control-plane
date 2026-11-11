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

import { Box } from '@wso2/oxygen-ui';
import { useEffect, useState, type JSX } from 'react';
// import { Link as RouterLink } from 'react-router';
import { citedNumbers } from '../../../utils/contextEngine';
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
  /** The question asked, for the excerpts. */
  question?: string;
}

/**
 * An answer beside its evidence. Pointing at a citation in the answer, or at a
 * passage in the rail, lights both ends of the link; clicking either pins it
 * until it is clicked again or Esc is pressed. On narrow screens the rail
 * follows the answer instead of sitting beside it.
 */
export default function AnsweredTurn({ answer, evidence, sources, facts = [], hrefFor, onOpen, derivationHref, question }: AnsweredTurnProps): JSX.Element {
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

  // The rail names only the passage, so its click releases a pin made from any sentence; a mark releases its own sentence and re-pins another.
  const togglePin = (focus: CitationFocus) => setPinned((prev) => (prev && prev.n === focus.n && (focus.sentence === undefined || prev.sentence === focus.sentence) ? null : focus));
  // With no graph facts the graph would light nothing, so the rail offers no way there.
  const graphHrefFor = facts.length ? derivationHref : undefined;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 330px' }, gap: 3, alignItems: 'start' }}>
      <Box sx={{ minWidth: 0 }}>
        <CitedAnswer answer={answer} passages={evidence.length} active={active} pinned={pinned} onHover={setActive} onPin={togglePin} />
        {/* How this answer was derived: hidden by the team for now (4ed1e9b2c). To bring it back, render this under the answer
            (with Button from oxygen-ui, ArrowRight from oxygen-ui-icons-react and Link as RouterLink from react-router):
        {derivationHref && (
          <Button size="small" variant="text" component={RouterLink} to={derivationHref()} endIcon={<ArrowRight size={14} />} sx={{ mt: 2, fontWeight: 600, px: 0.5 }}>
            How this answer was derived
          </Button>
        )}
        */}
      </Box>
      <EvidenceRail
        question={question}
        evidence={evidence}
        sources={sources}
        cited={cited}
        active={active?.n ?? null}
        pinned={pinned?.n ?? null}
        hrefFor={hrefFor}
        onHover={(n) => setActive(n === null ? null : { n })}
        onPin={(n) => togglePin({ n })}
        onOpen={onOpen}
        graphHrefFor={graphHrefFor}
      />
    </Box>
  );
}
