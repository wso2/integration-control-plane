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

// ── Playground ──────────────────────────────────────────────────────────────

export const suggestionRowSx = { display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' } as const;

export const citeChipSx = {
  height: 18,
  minWidth: 18,
  mx: 0.25,
  verticalAlign: 'super',
  fontSize: 11,
  fontWeight: 600,
  '& .MuiChip-label': { px: 0.75 },
} as const;

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
