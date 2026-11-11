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

import { Box, Chip, IconButton, Link, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, ExternalLink, Link as LinkIcon } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { absoluteUrl, evidencePlace, isOpaqueRecordId, passageExcerpt, queryTerms, sourceTypeName, VERSION_HINT, versionFromLabel } from '../../../utils/contextEngine';
import PassageText from './PassageText';
import SourceMark from '../SourceMark';
import { evidenceCardSx, mutedSx, passageSx } from '../styles';
import type { ContextEvidence, ContextSource } from '../../../types/contextEngine';

/** Where a passage sits: the item, then a JSON path as code, lines or sentences, and its section. */
export function EvidencePlace({ evidence, showRecord: wantRecord = true }: { evidence: ContextEvidence; showRecord?: boolean }): JSX.Element {
  const place = evidencePlace(evidence);
  // An id such as a Drive file id tells the reader nothing, so the source name above stands for it.
  const showRecord = wantRecord && !isOpaqueRecordId(evidence.recordId);
  return (
    <Typography component="span" variant="caption" sx={{ ...mutedSx, display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, flexWrap: 'wrap' }}>
      {showRecord && <span>{evidence.recordId}</span>}
      {place.path && (
        <>
          {showRecord && <span>·</span>}
          <Box component="code" sx={{ fontFamily: 'monospace', fontSize: 11.5, px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover', color: 'text.primary' }}>
            {place.path}
          </Box>
        </>
      )}
      {place.parts.map((p, i) => (
        <span key={p}>{`${showRecord || place.path || i > 0 ? '· ' : ''}${p}`}</span>
      ))}
    </Typography>
  );
}

interface EvidenceCardProps {
  evidence: ContextEvidence;
  /** Its number in the answer or list, as `[n]`. */
  n: number;
  source?: ContextSource;
  /** The passage page; Copy link copies its absolute form. */
  href: string;
  onOpen: () => void;
  id?: string;
  /** The question asked, so its words can be shown in bold. */
  question?: string;
}

/**
 * One passage the engine returned: its source, the exact place in the item,
 * and the text. Copy link and Open lead to the passage page, which checks
 * access again whenever it opens.
 */
export default function EvidenceCard({ evidence, n, source, href, onOpen, id, question = '' }: EvidenceCardProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(absoluteUrl(href)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  return (
    <Box id={id} sx={evidenceCardSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0, flexWrap: 'wrap' }}>
          <Chip size="small" label={`[${n}]`} />
          {source && <SourceMark type={source.type} size={16} />}
          <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap title={source ? sourceTypeName(source.type) : undefined}>
            {source ? source.name : evidence.sourceId}
          </Typography>
          <Box component="span" title={`${versionFromLabel(evidence.sourceVersion)}. ${VERSION_HINT}`} sx={{ minWidth: 0 }}>
            <EvidencePlace evidence={evidence} />
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0 }}>
          {evidence.sourceUrl && (
            <Link href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ mx: 0.5 }}>
              Open source
            </Link>
          )}
          <Tooltip title={copied ? 'Link copied' : 'Copy link to this passage'}>
            <IconButton size="small" aria-label={`Copy link to passage ${n}`} onClick={() => void copy()}>
              {copied ? <Check size={15} /> : <LinkIcon size={15} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Open passage">
            <IconButton size="small" aria-label={`Open passage ${n}`} onClick={onOpen}>
              <ExternalLink size={15} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Typography variant="body2" sx={passageSx}>
        “<PassageText text={passageExcerpt(evidence.passage, queryTerms(question))} terms={queryTerms(question)} />”
      </Typography>
    </Box>
  );
}
