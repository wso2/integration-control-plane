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

import { Box, Button, Paper, Stack, Typography } from '@wso2/oxygen-ui';
import { Hash, MessageSquare, Unlink } from '@wso2/oxygen-ui-icons-react';
import { type JSX } from 'react';
import { passageLines } from '../../../utils/contextEngine';
import { mutedSx, summaryCardSx } from '../styles';
import type { ContextEvidence } from '../../../types/contextEngine';

const chainStepSx = { flex: 1, minWidth: 180, p: 1.75, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' } as const;
const linesSx = { m: 0, py: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.85, overflowX: 'auto', bgcolor: 'background.paper' } as const;
const lineSx = { display: 'flex', bgcolor: 'rgba(255, 115, 0, 0.07)' } as const;
const lineNumberSx = { width: 52, flexShrink: 0, textAlign: 'right', pr: 2, color: 'warning.dark', userSelect: 'none' } as const;
const passageTextSx = { whiteSpace: 'pre-wrap', lineHeight: 1.65, p: 2, borderRadius: 1, bgcolor: 'rgba(255, 115, 0, 0.07)' } as const;
const unavailableSx = { ...summaryCardSx, height: 'auto', maxWidth: 620, p: 3.5 } as const;
const unavailableIconSx = { width: 48, height: 48, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;

/** One step of a passage's provenance: Source, ID or Version. */
export function ChainStep({ label, value, detail, mono = false }: { label: string; value: string; detail?: string; mono?: boolean }): JSX.Element {
  return (
    <Box sx={chainStepSx}>
      <Typography variant="overline" sx={{ ...mutedSx, lineHeight: 1.4, display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25, fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-word' }}>
        {value}
      </Typography>
      {detail && (
        <Typography variant="caption" sx={mutedSx}>
          {detail}
        </Typography>
      )}
    </Box>
  );
}

/** An evidence item's text under its section heading, as numbered source lines when they line up with the text. */
export function EvidenceText({ evidence }: { evidence: ContextEvidence }): JSX.Element {
  const lines = passageLines(evidence);
  const heading = evidence.locator?.heading;
  return (
    <>
      {heading && (
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ ...mutedSx, mb: 1 }}>
          <Hash size={14} aria-hidden />
          <Typography variant="body2">Under “{heading}”</Typography>
        </Stack>
      )}
      {lines ? (
        <Box component="pre" sx={linesSx}>
          {lines.map((line) => (
            <Box key={line.n} sx={lineSx}>
              <Box component="span" sx={lineNumberSx}>
                {line.n}
              </Box>
              <Box component="span" sx={{ whiteSpace: 'pre' }}>
                {line.text}
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography variant="body1" sx={passageTextSx}>
          {evidence.passage}
        </Typography>
      )}
    </>
  );
}

interface UnavailableCardProps {
  title: string;
  description: string;
  onAsk: () => void;
  backLabel: string;
  onBack: () => void;
}

/** What a passage or fact page shows when the engine no longer lets the reader see it, without saying why. */
export function UnavailableCard({ title, description, onAsk, backLabel, onBack }: UnavailableCardProps): JSX.Element {
  return (
    <Paper variant="outlined" sx={unavailableSx}>
      <Box sx={unavailableIconSx}>
        <Unlink size={22} aria-hidden />
      </Box>
      <Typography variant="h6" sx={{ mt: 2, fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ ...mutedSx, mt: 1, lineHeight: 1.55 }}>
        {description}
      </Typography>
      <Stack direction="row" gap={1.5} sx={{ mt: 2.5 }}>
        <Button variant="contained" startIcon={<MessageSquare size={16} />} onClick={onAsk}>
          Ask in the Playground
        </Button>
        <Button variant="outlined" onClick={onBack}>
          {backLabel}
        </Button>
      </Stack>
    </Paper>
  );
}
