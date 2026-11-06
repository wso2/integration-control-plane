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

/** The run's execution view: its summary, input and result, then the flow beside the timeline. */

/** Restored from maximized, the drawer still has room for the flow, the timeline and a step's details. */
export const DRAWER_WIDTH = 'min(1280px, 92vw)';

export const body = { p: 3 } as const;

export const content = { display: 'flex', flexDirection: 'column', gap: 2 } as const;

export const badge = { display: 'inline-flex', alignItems: 'center', gap: 1 } as const;

export const actions = { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1 } as const;

export const idRow = { display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 } as const;

/** A run's ids at the size of the card's other values. */
export const summaryId = { fontFamily: 'monospace', fontSize: '0.8125rem', wordBreak: 'break-all' } as const;

export const summaryError = { mt: 2 } as const;

export const payloadRow = { display: 'flex', flexWrap: 'wrap', gap: 2 } as const;

export const payloadCell = { flex: 1, minWidth: 280 } as const;

export const payloadNote = { ...payloadCell, alignSelf: 'center' } as const;

export const flowHeader = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 } as const;

export const unplacedLines = { display: 'flex', flexDirection: 'column', gap: 0.5 } as const;

/** Flow, timeline and (when a step is picked) its details, side by side at one height. */
export const flowSplit = { display: 'flex', gap: 1.5, height: '62vh', minHeight: 320 } as const;

export const flowPair = { display: 'flex', flex: 1, minWidth: 0, height: '100%' } as const;

export const flowResizer = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  flexShrink: 0,
  cursor: 'col-resize',
  touchAction: 'none',
  '&:hover > div': { bgcolor: 'primary.main' },
} as const;

export const flowResizerGrip = { width: 3, height: 44, borderRadius: 1, bgcolor: 'divider', transition: 'background-color 0.15s' } as const;

export const timelinePane = { flex: 1, minWidth: 0, height: '100%', overflow: 'hidden' } as const;

/**
 * The flow's card. It frames rather than scrolls, so the style toggle in its corner stays put
 * while the rail scrolls beneath it.
 */
export const railPane = {
  position: 'relative',
  flexShrink: 0,
  minWidth: 220,
  height: '100%',
  overflow: 'hidden',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'action.hover',
} as const;

export const railScroll = { height: '100%', overflow: 'auto' } as const;

export const railToggle = { position: 'absolute', top: 4, right: 4, zIndex: 1, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1 } as const;

export const railEmpty = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 2, textAlign: 'center' } as const;

export const railSkeleton = { display: 'flex', flexDirection: 'column', gap: 1, p: 1.5 } as const;

export const paneSkeleton = { height: '100%', borderRadius: 1 } as const;

export const historyEmpty = { py: 2 } as const;
