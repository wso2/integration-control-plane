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

export const toolbar = { alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 3 } as const;

export const rangeSelect = { minWidth: 180 } as const;

export const kpiGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 } as const;

export const card = { p: 2.5, mb: 3 } as const;

/** The Runtime Logs page's error state (LogsPanel), so both observability pages fail the same way. */
export const errorState = { alignItems: 'center', gap: 1.5, py: 8 } as const;

export const errorIcon = { opacity: 0.35 } as const;

export const errorDescription = { maxWidth: 420 } as const;

export const errorRetry = { mt: 0.5 } as const;

export const cardHeader = { mb: 2 } as const;

export const cardTitle = { fontWeight: 600 } as const;

/** Faint grid lines. */
export const chartBox = { '& .recharts-cartesian-grid line': { opacity: 0.3 } } as const;

/** Chart beside the service checklist; the checklist drops below it on narrow screens. */
export const chartLayout = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 260px' }, gap: 2 } as const;

export const chartEmpty = { height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;

export const serviceList = { minWidth: 0, maxHeight: 280, overflowY: 'auto' } as const;

export const serviceListHeader = { alignItems: 'center', justifyContent: 'space-between', mb: 0.5 } as const;

export const serviceOption = { display: 'flex', mx: 0 } as const;

export const serviceLabel = { alignItems: 'baseline', gap: 1, minWidth: 0 } as const;

export const serviceName = { fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

export const subheading = { mt: 3, mb: 1 } as const;

export const headerCell = { fontWeight: 600 } as const;

export const clickableRow = { cursor: 'pointer' } as const;

export const mono = { fontFamily: 'monospace', fontSize: 12 } as const;

export const attributeGrid = { display: 'grid', gridTemplateColumns: 'minmax(180px, max-content) 1fr', columnGap: 2, rowGap: 0.5, py: 1.5, px: 1 } as const;

export const attributeValue = { fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' } as const;

export const collapseCell = { py: 0, borderBottom: 'none' } as const;

export const operation = { display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, maxWidth: 360 } as const;

export const durationCell = { display: 'flex', alignItems: 'center', gap: 1, minWidth: 140 } as const;

export const durationBar = { height: 6, borderRadius: 3, maxWidth: 80, minWidth: 2, flexShrink: 0 } as const;

export const waterfall = { py: 1.5 } as const;

/** Name column, timeline and duration, as in the classic trace view. */
export const waterfallRow = {
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 2fr) minmax(160px, 3fr) 72px',
  alignItems: 'center',
  gap: 1.5,
  px: 1,
  py: 0.5,
  width: '100%',
  textAlign: 'left',
  borderRadius: 1,
  '&:hover': { bgcolor: 'action.hover' },
} as const;

export const waterfallName = { display: 'flex', flexDirection: 'column', minWidth: 0 } as const;

export const waterfallTrack = { position: 'relative', height: 12, bgcolor: 'action.hover', borderRadius: 1 } as const;

export const waterfallBar = { position: 'absolute', top: 0, bottom: 0, borderRadius: 1, opacity: 0.85 } as const;

export const waterfallDuration = { textAlign: 'right', whiteSpace: 'nowrap' } as const;
