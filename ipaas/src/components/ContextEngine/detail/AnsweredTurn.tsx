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
import { citedNumbers } from '../../../utils/contextEngine';
import CitedAnswer, { type CitationFocus } from './CitedAnswer';
import EvidenceRail from './EvidenceRail';
import type { ContextEvidence, ContextSource } from '../../../types/contextEngine';

interface AnsweredTurnProps {
  answer: string;
  /** The passages the model was given, in prompt order: `[n]` is `evidence[n - 1]`. */
  evidence: ContextEvidence[];
  sources: ContextSource[];
  hrefFor: (evidence: ContextEvidence) => string;
  onOpen: (evidence: ContextEvidence) => void;
}

/**
 * An answer beside its evidence. Pointing at a citation in the answer, or at a
 * passage in the rail, lights both ends of the link; clicking either pins it
 * until it is clicked again or Esc is pressed. On narrow screens the rail
 * follows the answer instead of sitting beside it.
 */
export default function AnsweredTurn({ answer, evidence, sources, hrefFor, onOpen }: AnsweredTurnProps): JSX.Element {
  const [active, setActive] = useState<CitationFocus | null>(null);
  const [pinned, setPinned] = useState<CitationFocus | null>(null);
  const cited = citedNumbers(answer);

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
      <CitedAnswer answer={answer} active={active} pinned={pinned} onHover={setActive} onPin={togglePin} />
      <EvidenceRail evidence={evidence} sources={sources} cited={cited} active={active?.n ?? null} pinned={pinned?.n ?? null} hrefFor={hrefFor} onHover={(n) => setActive(n === null ? null : { n })} onPin={(n) => togglePin({ n })} onOpen={onOpen} />
    </Box>
  );
}
