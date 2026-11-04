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

import { Box, ButtonBase, Stack, Typography } from '@wso2/oxygen-ui';
import { type JSX } from 'react';
import { derivationSummary } from '../../../utils/contextGraph';
import { citationMarkSx, mutedSx } from '../styles';
import type { ContextEvidence, ContextFact } from '../../../types/contextEngine';

interface GraphFactsProps {
  facts: ContextFact[];
  /** The passages returned with the facts: a fact's `[n]` is `evidence[n - 1]`. */
  evidence: ContextEvidence[];
  /** The passage pointed at, here or in the rail beside. */
  active: number | null;
  pinned: number | null;
  onHover: (n: number | null) => void;
  onPin: (n: number) => void;
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * Beside the passages: the graph relationships that came with them, each
 * marked with the passages it stands on. Pointing at a mark lights that
 * passage in the rail; clicking pins it. The words were written by the
 * language model while indexing, so they guide; the passages are what gets
 * cited.
 */
export default function GraphFacts({ facts, evidence, active, pinned, onHover, onPin }: GraphFactsProps): JSX.Element {
  const numberOf = new Map(evidence.map((e, i) => [e.id, i + 1]));
  const { entities } = derivationSummary({ evidence, facts });
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
        Evidence
      </Typography>
      <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mb: 1.25 }}>
        {count(facts.length, 'relationship', 'relationships')} naming {count(entities, 'entity', 'entities')}, each marked with the passages it stands on. They were written while indexing; cite the passages.
      </Typography>
      <Stack component="ul" gap={0.75} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {facts.map((fact, i) => {
          const numbers = fact.evidenceIds.map((id) => numberOf.get(id)).filter((n): n is number => n !== undefined);
          return (
            <Box component="li" key={`${fact.subject}|${fact.relation}|${fact.object}|${i}`} sx={{ fontSize: 13, lineHeight: 1.5 }}>
              <Box component="span" sx={{ fontWeight: 600 }}>
                {fact.subject}
              </Box>{' '}
              <Box component="span" sx={mutedSx}>
                {fact.relation}
              </Box>{' '}
              <Box component="span" sx={{ fontWeight: 600 }}>
                {fact.object}
              </Box>
              {numbers.map((n) => (
                <ButtonBase
                  key={n}
                  aria-label={`Passage ${n}`}
                  aria-pressed={pinned === n}
                  onMouseEnter={() => onHover(n)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(n)}
                  onBlur={() => onHover(null)}
                  onClick={() => onPin(n)}
                  sx={citationMarkSx(active === n || pinned === n, pinned === n)}>
                  {n}
                </ButtonBase>
              ))}
              {fact.linkedThrough && (
                <Box component="span" sx={mutedSx}>
                  {' '}
                  · via {fact.linkedThrough}
                </Box>
              )}
              {fact.text && (
                <Typography variant="caption" sx={{ ...mutedSx, display: 'block' }}>
                  {fact.text}
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
