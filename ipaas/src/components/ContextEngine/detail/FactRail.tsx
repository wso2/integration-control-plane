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

import { Box, Button, ButtonBase, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronRight, Waypoints } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import { factEvidence, restoreCase } from '../../../utils/contextEngine';
import { factCardSx, factNumberSx, factSentenceSx, mutedSx } from '../styles';
import type { ContextEvidence, ContextFact, ContextSource } from '../../../types/contextEngine';

const graphLinkSx = { minWidth: 0, p: 0, fontSize: 11.5, fontWeight: 600, '& .MuiButton-startIcon': { mr: 0.5 } } as const;

interface FactCardProps {
  fact: ContextFact;
  n: number;
  /** The passages it stands on. */
  support: ContextEvidence[];
  /** Every passage beside the answer, which gives the graph's lower-cased names back their spelling in the sources. */
  passages: string[];
  sourceName: (sourceId: string) => string;
  /** It is hovered or focused. */
  active: boolean;
  onHover: (n: number | null) => void;
  onOpen: () => void;
}

function FactCard({ fact, n, support, passages, sourceName, active, onHover, onOpen }: FactCardProps): JSX.Element {
  const sources = [...new Set(support.map((e) => sourceName(e.sourceId)))];
  const subject = restoreCase(fact.subject, passages);
  const object = restoreCase(fact.object, passages);
  return (
    <ButtonBase
      aria-label={`Statement ${n}: ${subject} ${fact.relation} ${object}. Open its evidence`}
      onMouseEnter={() => onHover(n)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(n)}
      onBlur={() => onHover(null)}
      onClick={onOpen}
      sx={factCardSx(active)}>
      <Stack direction="row" alignItems="flex-start" gap={1}>
        <Box component="span" sx={factNumberSx(active)}>
          {n}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontSize: 13, lineHeight: 1.5 }}>
            <Box component="span" sx={{ fontWeight: 600 }}>
              {subject}
            </Box>{' '}
            <Box component="span" sx={mutedSx}>
              {fact.relation}
            </Box>{' '}
            <Box component="span" sx={{ fontWeight: 600 }}>
              {object}
            </Box>
          </Typography>
          {fact.text && (
            <Typography variant="caption" sx={factSentenceSx}>
              {fact.text}
            </Typography>
          )}
          <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 0.5 }} noWrap title={sources.join(', ')}>
            {sources.join(', ')}
          </Typography>
        </Box>
        <Box component="span" aria-hidden sx={{ display: 'flex', flexShrink: 0, color: 'text.disabled', mt: 0.25 }}>
          <ChevronRight size={16} />
        </Box>
      </Stack>
    </ButtonBase>
  );
}

interface FactRailProps {
  /** The statements that support the answer, in the engine's order. */
  facts: ContextFact[];
  /** The passages the facts stand on. */
  evidence: ContextEvidence[];
  sources: ContextSource[];
  active: number | null;
  onHover: (n: number | null) => void;
  /** Opens the fact's page: the fact and the passages it stands on. */
  onOpen: (n: number) => void;
  /** The Graph tab URL that shows the answer's derivation. */
  graphHref?: string;
}

/**
 * The statements beside an answer, every one the engine says supports it, in
 * its order. A statement opens its own page, which shows the passages it stands on.
 */
export default function FactRail({ facts, evidence, sources, active, onHover, onOpen, graphHref }: FactRailProps): JSX.Element {
  const byId = new Map(sources.map((s) => [s.id, s.name]));
  const sourceName = (sourceId: string) => byId.get(sourceId) ?? sourceId;
  const passages = evidence.map((e) => e.passage);

  const renderCard = (fact: ContextFact, i: number) => {
    const n = i + 1;
    return (
      <FactCard
        key={`${fact.subject}|${fact.relation}|${fact.object}|${n}`}
        fact={fact}
        n={n}
        support={factEvidence(fact, evidence)}
        passages={passages}
        sourceName={sourceName}
        active={active === n}
        onHover={onHover}
        onOpen={() => onOpen(n)}
      />
    );
  };

  return (
    <Stack gap={1.25} sx={{ position: { lg: 'sticky' }, top: { lg: 16 } }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Statements
        </Typography>
        <Typography variant="caption" sx={{ ...mutedSx, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          Support the answer
          {graphHref && (
            <>
              <span aria-hidden>·</span>
              <Button size="small" variant="text" component={RouterLink} to={graphHref} startIcon={<Waypoints size={12} />} sx={graphLinkSx}>
                See in graph
              </Button>
            </>
          )}
        </Typography>
      </Stack>
      {facts.map(renderCard)}
    </Stack>
  );
}
