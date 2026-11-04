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

import { Alert, Box, Button, /* Chip, */ CircularProgress, Grid, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, /* Check, */ ChevronRight, Hash, /* Link as LinkIcon, */ MessageSquare, Unlink /* , Users */ } from '@wso2/oxygen-ui-icons-react';
import { /* useState, */ type JSX /* , type ReactNode */ } from 'react';
import { useLocation, useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { isContextEngineEnabled, useContextEngine, useContextEvidence, useContextPermissions } from '../hooks/useContextEngine';
import { /* absoluteUrl, */ evidenceBackTarget, /* evidencePart, evidencePlace, */ evidenceVersionLabel, passageLines, sourceTypeName } from '../utils/contextEngine';
import { contextEngineUrl /* , contextEvidenceUrl */ } from '../paths';
import { HttpError } from '../types/http';
import ComingSoon from './ComingSoon';
import { mutedSx, summaryCardHeaderSx, summaryCardSx, /* summaryRowSx, */ wrapSx } from '../components/ContextEngine/styles';
import type { /* ContextEvidence as Evidence, */ ContextEvidenceLocationState } from '../types/contextEngine';
import type { OrgScope } from '../nav';

const centeredSx = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 } as const;

// The title chip and the chain's Passage step, both hidden for now.
// /** The most precise place the engine knows, for the title chip and the chain. */
// function primaryPlace(ev: Evidence): string {
//   const l = ev.locator;
//   if (l?.path) return l.path;
//   return evidencePlace(ev).parts.find((p) => !p.startsWith('under')) ?? 'Passage';
// }

function ChainStep({ label, value, detail, mono = false }: { label: string; value: string; detail?: string; mono?: boolean }): JSX.Element {
  return (
    <Box sx={{ flex: 1, minWidth: 180, p: 1.75, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
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

// The "Where it is" card's rows, hidden with the card for now.
// function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
//   return (
//     <Box sx={summaryRowSx}>
//       <Typography variant="body2" sx={mutedSx}>
//         {label}
//       </Typography>
//       <Typography variant="body2" sx={{ textAlign: 'right' }}>
//         {children}
//       </Typography>
//     </Box>
//   );
// }

/**
 * One cited passage, opened from a citation link. The engine checks access
 * again on every open and answers the same 404 whether the passage changed,
 * was removed or is out of the reader's reach, so this page never says which.
 */
export default function ContextEvidence(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { engineId = '', evidenceId = '' } = useParams();
  const engine = useContextEngine(engineId);
  const evidence = useContextEvidence(evidenceId);
  const permissions = useContextPermissions(engineId);
  const { state } = useLocation() as { state: ContextEvidenceLocationState | null };
  // Copy link hidden for now.
  // const [copied, setCopied] = useState(false);

  if (!isContextEngineEnabled()) {
    return <ComingSoon title="Coming Soon" description="Context Engines are currently under development." />;
  }

  const engineName = engine.data?.name;
  // Back returns to the Playground when the passage was opened from there, so the conversation is still on screen.
  const backTarget = evidenceBackTarget(state, engineName);
  const toEngine = () => navigate(contextEngineUrl(scope.org, engineId, backTarget.tab));
  const back = (
    <Button startIcon={<ArrowLeft size={16} />} onClick={toEngine} sx={{ mb: 2 }}>
      {backTarget.label}
    </Button>
  );

  if (evidence.isLoading) {
    return (
      <PageContent sx={wrapSx}>
        {back}
        <Box sx={centeredSx}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }

  const ev = evidence.data;
  if (!ev) {
    const gone = evidence.error instanceof HttpError && evidence.error.status === 404;
    return (
      <PageContent sx={wrapSx}>
        {back}
        {gone ? (
          <Box sx={{ ...summaryCardSx, height: 'auto', maxWidth: 620, p: 3.5 }}>
            <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Unlink size={22} aria-hidden />
            </Box>
            <Typography variant="h6" sx={{ mt: 2, fontWeight: 600 }}>
              This passage is no longer available
            </Typography>
            <Typography variant="body2" sx={{ ...mutedSx, mt: 1, lineHeight: 1.55 }}>
              The item it came from may have changed or been removed, or you may not have access to it.
            </Typography>
            <Stack direction="row" gap={1.5} sx={{ mt: 2.5 }}>
              <Button variant="contained" startIcon={<MessageSquare size={16} />} onClick={() => navigate(contextEngineUrl(scope.org, engineId, 'playground'))}>
                Ask in the Playground
              </Button>
              <Button variant="outlined" onClick={toEngine}>
                {backTarget.label}
              </Button>
            </Stack>
          </Box>
        ) : (
          <Alert
            severity="error"
            variant="outlined"
            action={
              <Button color="inherit" size="small" onClick={() => evidence.refetch()}>
                Retry
              </Button>
            }>
            Couldn&apos;t load this passage. Please try again.
          </Alert>
        )}
      </PageContent>
    );
  }

  const source = engine.data?.sources.find((s) => s.id === ev.sourceId);
  // const place = evidencePlace(ev);
  // const part = evidencePart(ev);
  const lines = passageLines(ev);
  const l = ev.locator;
  // Someone who may open evidence but not ask: the engine's evidence.read without context.read.
  const readerOnly = !!permissions.data && !permissions.data.includes('context.read');
  // Ask about this hidden for now.
  // const subject = l?.heading ?? ev.recordId;
  // const askAbout = () => navigate(`${contextEngineUrl(scope.org, engineId, 'playground')}?q=${encodeURIComponent(`What else do the sources say about “${subject}”?`)}`);
  // const copyLink = () =>
  //   navigator.clipboard?.writeText(absoluteUrl(contextEvidenceUrl(scope.org, engineId, ev.id))).then(() => {
  //     setCopied(true);
  //     window.setTimeout(() => setCopied(false), 1500);
  //   });
  // const passageDetail = [l?.sentences ? (l.sentences.first === l.sentences.last ? `Sentence ${l.sentences.first}` : `Sentences ${l.sentences.first}–${l.sentences.last}`) : '', !place.coarse && part !== undefined ? `part ${part}` : '']
  //   .filter(Boolean)
  //   .join(' · ');

  return (
    <PageContent sx={wrapSx}>
      {back}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
            <Typography variant="h6" component="h1" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
              {ev.recordId}
            </Typography>
            {/* The passage's place, such as "Part 2", hidden for now.
            <Chip size="small" variant="outlined" label={primaryPlace(ev)} sx={l?.path ? { fontFamily: 'monospace' } : undefined} />
            */}
          </Stack>
          {/* The subtitle, hidden for now.
          <Typography variant="body2" sx={{ ...mutedSx, mt: 0.5 }}>
            A passage from {engineName ?? 'this context engine'}, cited as evidence.
          </Typography>
          */}
        </Box>
        {/* Copy link and Ask about this hidden for now.
        <Stack direction="row" gap={1.25}>
          <Button variant="outlined" startIcon={copied ? <Check size={16} /> : <LinkIcon size={16} />} onClick={() => void copyLink()}>
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
          <Button variant="contained" startIcon={<MessageSquare size={16} />} disabled={readerOnly} onClick={askAbout}>
            Ask about this
          </Button>
        </Stack>
        */}
      </Stack>

      {readerOnly && (
        <Alert severity="info" variant="outlined" sx={{ mt: 2.5 }}>
          You can&apos;t ask this engine questions. Ask an engine manager for access.
        </Alert>
      )}

      <Box sx={{ ...summaryCardSx, height: 'auto', mt: 3 }}>
        <Box sx={summaryCardHeaderSx}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Provenance
          </Typography>
        </Box>
        <Stack direction="row" alignItems="stretch" gap={1} sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' }, '& > svg': { alignSelf: 'center' } }} aria-label="Where this passage comes from">
          <ChainStep label="Source" value={source?.name ?? ev.sourceId} detail={source ? sourceTypeName(source.type) : undefined} />
          <ChevronRight size={18} aria-hidden style={{ flexShrink: 0, opacity: 0.5 }} />
          <ChainStep label="ID" value={ev.recordId} />
          <ChevronRight size={18} aria-hidden style={{ flexShrink: 0, opacity: 0.5 }} />
          <ChainStep label="Version" value={evidenceVersionLabel(ev.sourceVersion)} />
          {/* The Passage step, hidden for now.
          <ChevronRight size={18} aria-hidden style={{ flexShrink: 0, opacity: 0.5 }} />
          <ChainStep label="Passage" value={primaryPlace(ev)} detail={passageDetail || undefined} mono={!!l?.path} />
          */}
        </Stack>
      </Box>

      <Grid container spacing={2} sx={{ mt: 2 }}>
        {/* Full width while the side cards are hidden; it was md: 7 beside them. */}
        <Grid size={{ xs: 12 }}>
          <Box sx={{ ...summaryCardSx, height: 'auto' }}>
            <Box sx={summaryCardHeaderSx}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Evidence
              </Typography>
            </Box>
            {l?.heading && (
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ ...mutedSx, mb: 1 }}>
                <Hash size={14} aria-hidden />
                <Typography variant="body2">Under “{l.heading}”</Typography>
              </Stack>
            )}
            {lines ? (
              <Box component="pre" sx={{ m: 0, py: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.85, overflowX: 'auto', bgcolor: 'background.paper' }}>
                {lines.map((line) => (
                  <Box key={line.n} sx={{ display: 'flex', bgcolor: 'rgba(255, 115, 0, 0.07)' }}>
                    <Box component="span" sx={{ width: 52, flexShrink: 0, textAlign: 'right', pr: 2, color: 'warning.dark', userSelect: 'none' }}>
                      {line.n}
                    </Box>
                    <Box component="span" sx={{ whiteSpace: 'pre' }}>
                      {line.text}
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, p: 2, borderRadius: 1, bgcolor: 'rgba(255, 115, 0, 0.07)' }}>
                {ev.passage}
              </Typography>
            )}
          </Box>
        </Grid>
        {/* The "Where it is" and "Who can open this link" cards, hidden for now.
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack gap={2}>
            <Box sx={{ ...summaryCardSx, height: 'auto' }}>
              <Box sx={summaryCardHeaderSx}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Where it is
                </Typography>
              </Box>
              {l?.heading && <Row label="Section">{l.heading}</Row>}
              {l?.path && (
                <Row label="JSON path">
                  <Box component="code" sx={{ fontFamily: 'monospace', fontSize: 12.5 }}>
                    {l.path}
                  </Box>
                </Row>
              )}
              {l?.lines && <Row label="Lines">{l.lines.first === l.lines.last ? l.lines.first : `${l.lines.first}–${l.lines.last}`}</Row>}
              {l?.sentences && <Row label="Sentences">{l.sentences.first === l.sentences.last ? l.sentences.first : `${l.sentences.first}–${l.sentences.last}`}</Row>}
              {l?.characters && (
                <Row label="Characters">
                  {l.characters.start}–{l.characters.end}
                </Row>
              )}
              {part !== undefined && (
                <Row label="Part">
                  {part} of {ev.recordId}
                </Row>
              )}
              <Row label="Version">{evidenceVersionLabel(ev.sourceVersion)}</Row>
            </Box>
            <Box sx={{ ...summaryCardSx, height: 'auto' }}>
              <Stack direction="row" gap={1.25} alignItems="flex-start">
                <Users size={18} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Who can open this link
                  </Typography>
                  <Typography variant="body2" sx={{ ...mutedSx, mt: 0.75, lineHeight: 1.55 }}>
                    People who can see this item. The link stops working when the item changes or is removed.
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </Grid>
        */}
      </Grid>
    </PageContent>
  );
}
