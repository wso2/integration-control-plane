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

import { Box, Chip, Link, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { absoluteUrl, evidenceVersionLabel, splitCitations } from '../../../utils/contextEngine';
import { EvidencePlace } from './EvidenceCard';
import { citeChipSx, mutedSx } from '../styles';
import type { ContextEvidence, ContextSource } from '../../../types/contextEngine';

interface CitedAnswerProps {
  answer: string;
  /** The passages the model was given, in prompt order: `[n]` is `evidence[n - 1]`. */
  evidence: ContextEvidence[];
  sources: ContextSource[];
  /** The passage page for a piece of evidence. */
  hrefFor: (evidence: ContextEvidence) => string;
  onOpen: (evidence: ContextEvidence) => void;
  /** Click on a citation: scroll to its card. */
  onJump: (n: number) => void;
  /** Hovering a citation highlights its card; null when it leaves. */
  onPeek: (n: number | null) => void;
}

const peekSx = {
  bgcolor: 'background.paper',
  color: 'text.primary',
  border: '1px solid',
  borderColor: 'divider',
  boxShadow: 6,
  maxWidth: 420,
  p: 1.5,
  '& .MuiTooltip-arrow': { color: 'background.paper', '&::before': { border: '1px solid', borderColor: 'divider' } },
} as const;

function Peek({ n, evidence, source, href, onOpen }: { n: number; evidence: ContextEvidence; source?: ContextSource; href: string; onOpen: () => void }): JSX.Element {
  return (
    <Stack gap={0.75}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Chip size="small" label={`[${n}]`} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {source?.name ?? evidence.sourceId}
        </Typography>
      </Stack>
      <Typography variant="caption" sx={mutedSx}>
        <EvidencePlace evidence={evidence} /> · version of {evidenceVersionLabel(evidence.sourceVersion)}
      </Typography>
      <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        “{evidence.passage}”
      </Typography>
      <Stack direction="row" gap={2}>
        <Link component="button" type="button" variant="body2" onClick={onOpen}>
          Open passage
        </Link>
        <Link component="button" type="button" variant="body2" onClick={() => void navigator.clipboard?.writeText(absoluteUrl(href))}>
          Copy link
        </Link>
      </Stack>
    </Stack>
  );
}

/**
 * An answer with its `[n]` citations as small chips. Hovering one shows the
 * passage it names and where it sits; clicking jumps to its card. The engine
 * already removed any citation to a passage the model was not given.
 */
export default function CitedAnswer({ answer, evidence, sources, hrefFor, onOpen, onJump, onPeek }: CitedAnswerProps): JSX.Element {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return (
    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
      {splitCitations(answer).map((part, i) => {
        if (part.kind === 'text') return <span key={i}>{part.text}</span>;
        const ev = evidence[part.n - 1];
        const chip = <Chip component="button" size="small" color="primary" variant="outlined" label={part.n} clickable onClick={() => onJump(part.n)} aria-label={`Evidence ${part.n}`} sx={citeChipSx} />;
        if (!ev)
          return (
            <Box key={i} component="span">
              {chip}
            </Box>
          );
        return (
          <Tooltip
            key={i}
            arrow
            placement="bottom"
            enterDelay={150}
            onOpen={() => onPeek(part.n)}
            onClose={() => onPeek(null)}
            title={<Peek n={part.n} evidence={ev} source={byId.get(ev.sourceId)} href={hrefFor(ev)} onOpen={() => onOpen(ev)} />}
            slotProps={{ tooltip: { sx: peekSx } }}>
            {chip}
          </Tooltip>
        );
      })}
    </Typography>
  );
}
