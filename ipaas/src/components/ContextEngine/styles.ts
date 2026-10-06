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

// ── Wizard ──────────────────────────────────────────────────────────────────

/** Step section heading — smaller than the page title. */
export const stepHeadingSx = { fontWeight: 600, mb: 0.5 } as const;

/** One-line explanation under a step heading. */
export const stepHintSx = { color: 'text.secondary', mb: 2.5 } as const;

/** Vertical field stack within a step. */
export const fieldStackSx = { gap: 2.5, maxWidth: 560 } as const;

/** Source / provider tile grid spacing. */
export const tileGridSx = { mb: 3 } as const;

// ── Sources step: list, empty state, quick add ──────────────────────────────

export const sourcesToolbarSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 2,
  mb: 1.5,
} as const;

export const emptySourcesCardSx = {
  p: 5,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 1.5,
  textAlign: 'center',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'background.paper',
} as const;

export const marksRowSx = { display: 'flex', gap: 1.25 } as const;

export const quickAddRowSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.25,
  mt: 2.5,
  flexWrap: 'wrap',
} as const;

export const sourceListSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'background.paper',
} as const;

export const sourceRowSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.75,
  px: 2,
  py: 1.75,
  borderBottom: '1px solid',
  borderColor: 'divider',
  '&:last-of-type': { borderBottom: 0 },
} as const;

export const sourceRowTextSx = { flex: 1, minWidth: 0 } as const;

/** A connector's mark in a 36px tinted square, for rows and tiles. */
export const sourceTileMarkSx = {
  width: 36,
  height: 36,
  borderRadius: 1,
  bgcolor: 'action.hover',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'text.secondary',
  flexShrink: 0,
} as const;

// ── Source drawer ───────────────────────────────────────────────────────────

export const sourceDrawerSx = {
  '& .MuiDrawer-paper': {
    width: 720,
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
} as const;

export const drawerHeaderSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1,
  px: 3,
  py: 2,
  borderBottom: '1px solid',
  borderColor: 'divider',
  flexShrink: 0,
} as const;

export const drawerBodySx = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  px: 3,
  py: 2.5,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
} as const;

export const drawerFooterSx = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 1.5,
  px: 3,
  py: 1.75,
  borderTop: '1px solid',
  borderColor: 'divider',
  flexShrink: 0,
  bgcolor: 'background.paper',
} as const;

export const catalogChipsSx = { display: 'flex', gap: 1, flexWrap: 'wrap' } as const;

export const catalogSectionSx = {
  fontWeight: 600,
  color: 'text.secondary',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  fontSize: 12,
} as const;

export const catalogGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 1.5,
} as const;

export const catalogSentinelSx = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 0.5,
  py: 1,
} as const;

/** Wraps a catalog tile so the "Coming soon" badge can sit over its top-right corner. */
export const catalogTileWrapSx = { position: 'relative' } as const;

export const comingSoonBadgeSx = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 1,
  pointerEvents: 'none',
} as const;

export const connectorHeaderSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.75,
  pb: 2,
  borderBottom: '1px solid',
  borderColor: 'divider',
} as const;

/** Small brand mark / icon shown in a source panel header or overview row. */
export const sourceMarkSx = {
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'text.secondary',
  flexShrink: 0,
} as const;

// ── Review + Overview cards ─────────────────────────────────────────────────

export const summaryCardSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  p: 2.5,
  height: '100%',
} as const;

export const summaryCardHeaderSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1,
  mb: 1.5,
} as const;

export const summaryRowSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 2,
  py: 1,
  borderBottom: '1px solid',
  borderColor: 'divider',
  '&:last-of-type': { borderBottom: 0 },
} as const;

export const mutedSx = { color: 'text.secondary' } as const;

// ── Source visibility rules ─────────────────────────────────────────────────

export const audienceSectionSx = { mt: 3, pt: 2.5, borderTop: '1px solid', borderColor: 'divider' } as const;

/** Group, role and remove button on one line; stacks on narrow drawers. */
export const audienceRowSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1fr) auto' },
  gap: 1.5,
  alignItems: 'start',
} as const;

// ── File uploads ────────────────────────────────────────────────────────────

export const dropzoneSx = (over: boolean, compact: boolean, disabled: boolean) =>
  ({
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    p: compact ? '12px 16px' : '22px 20px',
    flexDirection: compact ? 'row' : 'column',
    textAlign: compact ? 'left' : 'center',
    border: '1.5px dashed',
    borderColor: over ? 'primary.main' : 'divider',
    borderRadius: 2.5,
    bgcolor: over ? 'action.hover' : 'background.paper',
    opacity: disabled ? 0.6 : 1,
    transition: 'border-color 120ms, background-color 120ms',
  }) as const;

export const dropzoneIconSx = (compact: boolean) =>
  ({
    width: compact ? 32 : 40,
    height: compact ? 32 : 40,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'primary.main',
    bgcolor: 'action.hover',
    flexShrink: 0,
  }) as const;

export const fileListSx = { border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' } as const;

export const fileRowSx = (dimmed = false) =>
  ({
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    px: 1.75,
    py: 1.25,
    borderBottom: '1px solid',
    borderColor: 'divider',
    opacity: dimmed ? 0.75 : 1,
    '&:last-of-type': { borderBottom: 0 },
  }) as const;

/** An uploaded file: name line, then the bar and captions under it. */
export const uploadRowSx = { px: 1.75, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } } as const;

export const uploadRowHeadSx = { display: 'flex', alignItems: 'center', gap: 1.5 } as const;

/** Lines the bar and captions up with the file name: the 18px icon plus the 12px gap. */
export const uploadRowBodySx = { pl: '30px', mt: 0.75 } as const;

export const filesDrawerSx = { '& .MuiDrawer-paper': { width: { xs: '100%', sm: 600 }, maxWidth: '100%', display: 'flex', flexDirection: 'column' } } as const;

export const filesToolbarSx = { display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' } as const;

export const sectionLabelSx = { fontWeight: 600, mb: 1 } as const;

/** The post-create card on the wizard: steps down the left, the file list under the upload step. */
export const setupCardSx = { border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 3, bgcolor: 'background.paper', maxWidth: 720 } as const;

export const setupStepSx = { display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 } as const;

export const setupDotSx = (tone: 'done' | 'running' | 'skipped' | 'failed') =>
  ({
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: tone === 'done' ? 'success.contrastText' : tone === 'failed' ? 'error.main' : tone === 'skipped' ? 'warning.dark' : 'primary.main',
    bgcolor: tone === 'done' ? 'success.main' : 'transparent',
    border: tone === 'done' ? 0 : '1px solid',
    borderColor: tone === 'failed' ? 'error.main' : tone === 'skipped' ? 'warning.main' : 'divider',
  }) as const;

// ── Source progress ─────────────────────────────────────────────────────────

/** A source with its progress bar and captions under the name line. */
export const sourceProgressRowSx = {
  py: 1.25,
  borderBottom: '1px solid',
  borderColor: 'divider',
  '&:last-of-type': { borderBottom: 0, pb: 0 },
} as const;

export const sourceProgressHeadSx = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 } as const;

/** Lines the bar and captions up with the source name: the 24px mark box plus the 12px gap. */
export const sourceProgressBodySx = { mt: 1, pl: '36px', minWidth: 0 } as const;

export const progressBarSx = { height: 6, borderRadius: 3 } as const;

export const progressCaptionSx = { color: 'text.secondary', display: 'block', mt: 0.75 } as const;

/** Whole-engine bar shown above the rows while several sources sync. */
export const progressOverallSx = { mb: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' } as const;

export const progressHeadlineSx = { display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' } as const;

// ── Playground ──────────────────────────────────────────────────────────────

/** The question box and Ask button side by side, centred on the box; the shortcut hint sits below the row. */
export const askBarSx = {
  display: 'flex',
  gap: 1.5,
  alignItems: 'center',
} as const;

export const answerCardSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  p: 2.5,
  bgcolor: 'background.paper',
} as const;

export const evidenceCardSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  p: 2,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
} as const;

export const passageSx = {
  fontStyle: 'italic',
  whiteSpace: 'pre-wrap',
} as const;

export const questionBubbleSx = {
  alignSelf: 'flex-end',
  maxWidth: '80%',
  px: 2,
  py: 1.25,
  borderRadius: 2,
  bgcolor: 'primary.main',
  color: 'primary.contrastText',
  whiteSpace: 'pre-wrap',
} as const;

// ── Exposure tabs ───────────────────────────────────────────────────────────

export const exposureHeaderSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 2,
  mb: 3,
} as const;

export const endpointRowSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  mb: 3,
} as const;

export const endpointFieldSx = {
  flex: 1,
  '& input': { fontFamily: 'monospace', fontSize: 13 },
} as const;

// ── Models step ─────────────────────────────────────────────────────────────

export const recommendedBannerSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.75,
  p: 2,
  mb: 2.5,
  border: '1px solid',
  borderColor: 'primary.light',
  borderRadius: 1,
  bgcolor: 'background.paper',
} as const;

export const modelColumnsSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 2.5,
} as const;

export const modelColumnSx = {
  p: 2.5,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'background.paper',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
} as const;

export const modelTileGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 1.25,
} as const;

// ── Quick add ───────────────────────────────────────────────────────────────

export const quickAddButtonSx = {
  borderRadius: 4,
  textTransform: 'none',
  color: 'text.primary',
  borderColor: 'divider',
  '& .MuiButton-endIcon': { color: 'text.secondary' },
} as const;

// ── Get-started checklist ───────────────────────────────────────────────────

export const checklistSx = {
  display: 'flex',
  gap: 3,
  alignItems: 'flex-start',
  p: 2.5,
  mb: 2,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'background.paper',
} as const;

export const checklistStepSx = { flex: 1, display: 'flex', gap: 1.5, alignItems: 'flex-start', minWidth: 0 } as const;

export const checklistDotSx = (state: 'done' | 'current' | 'todo') =>
  ({
    width: 24,
    height: 24,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 600,
    color: 'common.white',
    bgcolor: state === 'done' ? 'success.main' : state === 'current' ? 'primary.main' : 'action.disabled',
  }) as const;

// ── Listing ─────────────────────────────────────────────────────────────────

export const listMarksSx = { display: 'flex', alignItems: 'center', gap: 0.5 } as const;

export const listProgressTextSx = { display: 'block', mt: 0.5, whiteSpace: 'nowrap' } as const;

// ── Playground ──────────────────────────────────────────────────────────────

export const suggestionRowSx = { display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' } as const;

/** A `[n]` citation in an answer: an outlined number that fills while pointed at, with a ring while pinned. */
export const citationMarkSx = (lit: boolean, pinned: boolean) =>
  ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 18,
    minWidth: 18,
    px: 0.6,
    mx: 0.25,
    borderRadius: 9,
    verticalAlign: 'super',
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1,
    border: '1px solid',
    borderColor: lit ? 'primary.main' : 'primary.light',
    bgcolor: lit ? 'primary.main' : 'background.paper',
    color: lit ? 'primary.contrastText' : 'primary.main',
    boxShadow: pinned ? '0 0 0 3px rgba(255, 115, 0, 0.25)' : 'none',
    transition: 'background-color 120ms, color 120ms, box-shadow 120ms',
  }) as const;

/** An answer rendered from Markdown: modest headings, tight lists, inline code, the last block flush with the card. */
export const answerMarkdownSx = {
  fontSize: '1rem',
  lineHeight: 1.75,
  '& h1, & h2, & h3, & h4, & h5, & h6': { fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.4, mt: 2, mb: 0.75 },
  '& p': { m: 0, mb: 1.5 },
  '& ul, & ol': { pl: 3, m: 0, mb: 1.5 },
  '& li': { mb: 0.5 },
  '& li > p': { mb: 0.5 },
  '& code': { fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontSize: '0.85em' },
  '& pre': { bgcolor: 'action.hover', p: 1.5, borderRadius: 1, overflow: 'auto', mb: 1.5, fontSize: '0.85rem', lineHeight: 1.5 },
  '& pre code': { bgcolor: 'transparent', px: 0, fontSize: 'inherit' },
  '& blockquote': { m: 0, mb: 1.5, pl: 2, borderLeft: '3px solid', borderColor: 'divider', color: 'text.secondary' },
  '& a': { color: 'primary.main' },
  '& table': { borderCollapse: 'collapse', mb: 1.5, display: 'block', overflowX: 'auto', fontSize: '0.9rem' },
  '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1.5, py: 0.5, textAlign: 'left' },
  '& th': { fontWeight: 600 },
  '& > :last-child, & > div > :last-child': { mb: 0 },
} as const;

/** The sentence a pointed-at citation supports. */
export const litSentenceSx = {
  bgcolor: 'rgba(255, 115, 0, 0.12)',
  boxShadow: (t: { palette: { primary: { main: string } } }) => `0 1px 0 ${t.palette.primary.main}`,
  borderRadius: '3px',
  px: 0.25,
} as const;

/** A passage in the evidence rail beside an answer. */
export const railCardSx = (active: boolean, pinned: boolean, dimmed: boolean) =>
  ({
    border: '1px solid',
    borderColor: active || pinned ? 'primary.main' : 'divider',
    boxShadow: pinned ? (t: { palette: { primary: { main: string } } }) => `0 0 0 1px ${t.palette.primary.main}, 0 8px 24px rgba(255, 115, 0, 0.14)` : active ? (t: { palette: { primary: { main: string } } }) => `0 0 0 1px ${t.palette.primary.main}` : 'none',
    borderRadius: 1.25,
    px: 1.75,
    py: 1.5,
    bgcolor: active && !pinned ? 'rgba(255, 115, 0, 0.04)' : 'background.paper',
    opacity: dimmed ? 0.55 : 1,
    transition: 'border-color 120ms, box-shadow 120ms, opacity 120ms',
  }) as const;

/** The number badge on a rail card; a button that pins the passage. */
export const railNumberSx = (lit: boolean) =>
  ({
    width: 20,
    height: 20,
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
    bgcolor: lit ? 'primary.main' : 'action.selected',
    color: lit ? 'primary.contrastText' : 'text.primary',
    transition: 'background-color 120ms, color 120ms',
  }) as const;

export const answerFooterSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 2,
  mt: 2,
  flexWrap: 'wrap',
} as const;

// ── MCP ─────────────────────────────────────────────────────────────────────

export const clientTabsSx = { minHeight: 36, mb: 1.5, '& .MuiTab-root': { minHeight: 36, py: 0.5 } } as const;

export const playgroundFrameSx = { mt: 2, height: 560, display: 'flex', flexDirection: 'column' } as const;

// ── Storage step ────────────────────────────────────────────────────────────

/** Three cards need the widest screens; below that two per row keep the pickers readable. */
export const storageGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
  alignItems: 'start',
} as const;

export const storageCardSx = {
  p: 2.25,
  minWidth: 0,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'background.paper',
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
} as const;

/** MUI's FormGroup wraps its column by default, which lets long options escape the card. */
export const storageRadioGroupSx = { width: '100%', flexWrap: 'nowrap', minWidth: 0 } as const;

/** One placement option inside a storage card; highlighted when selected. */
export const storageOptionSx = (selected: boolean) =>
  ({
    p: 1.25,
    mb: 1,
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    border: '1px solid',
    borderColor: selected ? 'primary.main' : 'divider',
    borderRadius: 1,
    '& .MuiFormControlLabel-root': { alignItems: 'flex-start', m: 0, width: '100%' },
    '& .MuiFormControlLabel-label': { minWidth: 0, flex: 1 },
    '& .MuiRadio-root': { pt: 0.25 },
  }) as const;

/** The fields under a selected option: full card width, no indent, so pickers and buttons have room. */
export const storageOptionBodySx = { mt: 1.5, minWidth: 0 } as const;

export const storageEmptySx = {
  p: 1.75,
  border: '1px dashed',
  borderColor: 'divider',
  borderRadius: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 1.25,
} as const;

export const storageLinksSx = { display: 'flex', gap: 2, alignItems: 'center' } as const;
