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
import EvidenceRail from './EvidenceRail';
import GraphFacts from './GraphFacts';
import type { ContextEvidence, ContextFact, ContextSource } from '../../../types/contextEngine';

interface FactsTurnProps {
  facts: ContextFact[];
  /** The passages returned, in rank order: a fact's `[n]` is `evidence[n - 1]`. */
  evidence: ContextEvidence[];
  sources: ContextSource[];
  hrefFor: (evidence: ContextEvidence) => string;
  onOpen: (evidence: ContextEvidence) => void;
  /** The Graph tab URL that lights the facts' part of the graph; with a passage, that passage opens chosen. */
  graphHrefFor: (evidence?: ContextEvidence) => string;
  /** The question asked, for the excerpts. */
  question?: string;
}

/**
 * Passages returned with graph facts, laid out as an answer is: the facts
 * beside the passages they stand on. Pointing at a fact's passage mark, or at
 * a passage in the rail, lights both; clicking either pins it until it is
 * clicked again or Esc is pressed.
 */
export default function FactsTurn({ facts, evidence, sources, hrefFor, onOpen, graphHrefFor, question }: FactsTurnProps): JSX.Element {
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  useEffect(() => {
    if (pinned === null) return;
    const release = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(null);
    };
    window.addEventListener('keydown', release);
    return () => window.removeEventListener('keydown', release);
  }, [pinned]);

  const togglePin = (n: number) => setPinned((prev) => (prev === n ? null : n));

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 330px' }, gap: 3, alignItems: 'start' }}>
      <Box sx={{ minWidth: 0 }}>
        <GraphFacts facts={facts} evidence={evidence} active={active} pinned={pinned} onHover={setActive} onPin={togglePin} />
      </Box>
      <EvidenceRail question={question} evidence={evidence} sources={sources} active={active} pinned={pinned} hrefFor={hrefFor} onHover={setActive} onPin={togglePin} onOpen={onOpen} graphHrefFor={graphHrefFor} />
    </Box>
  );
}
