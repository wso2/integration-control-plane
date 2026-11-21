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
import { useState, type JSX, type ReactNode } from 'react';
import CitedAnswer from './CitedAnswer';
import FactRail from './FactRail';
import type { ContextEvidence, ContextFact, ContextSource } from '../../../types/contextEngine';

interface AnsweredTurnProps {
  answer: string;
  /** The statements that support the answer, in the engine's order. */
  facts: ContextFact[];
  /** The passages the facts stand on. */
  evidence: ContextEvidence[];
  sources: ContextSource[];
  /** Opens statement `n`'s page: the statement and the passages it stands on. */
  onOpenFact: (n: number) => void;
  /** The Graph tab URL that shows how the answer was derived; the rail links to it. */
  derivationHref?: string;
  /** The outcome line and actions, kept right under the answer so a short answer leaves no gap above them. */
  footer?: ReactNode;
}

/**
 * An answer beside the statements that support it. The engine does not cite
 * them in the answer; the rail lists them all, and clicking one opens its page.
 * On narrow screens the rail follows the answer instead of sitting beside it.
 */
export default function AnsweredTurn({ answer, facts, evidence, sources, onOpenFact, derivationHref, footer }: AnsweredTurnProps): JSX.Element {
  const [active, setActive] = useState<number | null>(null);
  // With no graph facts the graph would light nothing, so the rail offers no way there.
  const graphHref = facts.length ? derivationHref : undefined;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 330px' }, gap: 3, alignItems: 'start' }}>
      <Box sx={{ minWidth: 0 }}>
        <CitedAnswer answer={answer} passages={evidence.length} active={null} pinned={null} onHover={() => undefined} onPin={() => undefined} />
        {footer}
      </Box>
      <FactRail facts={facts} evidence={evidence} sources={sources} active={active} onHover={setActive} onOpen={onOpenFact} graphHref={graphHref} />
    </Box>
  );
}
