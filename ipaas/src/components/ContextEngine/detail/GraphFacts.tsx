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

import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import { type JSX } from 'react';
import { restoreCase } from '../../../utils/contextEngine';
import { mutedSx } from '../styles';
import type { ContextEvidence, ContextFact } from '../../../types/contextEngine';

interface GraphFactsProps {
  facts: ContextFact[];
  /** The passages returned with the facts, read for the spelling of names. */
  evidence: ContextEvidence[];
}

/** Beside the passages: the graph relationships that came with them. The words were written by the language model while indexing, so they guide; the passages are the evidence. */
export default function GraphFacts({ facts, evidence }: GraphFactsProps): JSX.Element {
  const passages = evidence.map((e) => e.passage);
  return (
    <Box>
      <Stack component="ul" gap={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {facts.map((fact, i) => {
          const object = restoreCase(fact.object, passages);
          const cut = object.lastIndexOf(' ');
          return (
            <Box component="li" key={`${fact.subject}|${fact.relation}|${fact.object}|${i}`} sx={{ fontSize: 14, lineHeight: 1.6 }}>
              <Box component="span" sx={{ fontWeight: 600 }}>
                {restoreCase(fact.subject, passages)}
              </Box>{' '}
              <Box component="span" sx={mutedSx}>
                {fact.relation}
              </Box>{' '}
              <Box component="span" sx={{ fontWeight: 600 }}>
                {cut > 0 ? object.slice(0, cut + 1) : ''}
              </Box>
              <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {cut > 0 ? object.slice(cut + 1) : object}
                </Box>
              </Box>
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
