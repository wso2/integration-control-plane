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

export const LABEL_W = 190;
export const ROW_H = 36;
export const BAR_H = 16;
export const AXIS_H = 26;
export const TICK_COUNT = 5;

const LANE_MIN_W = 360;

const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

export const frame = { display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 } as const;

export const root = {
  flex: 1,
  height: '100%',
  overflow: 'auto',
  bgcolor: 'action.hover',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  // The rows keep their own minimum width, so a narrowed card scrolls instead of overflowing.
  minWidth: 0,
} as const;

export const empty = { ...root, p: 2 } as const;

export const row = (selected: boolean, dimmed: boolean) =>
  ({
    display: 'flex',
    alignItems: 'center',
    minWidth: LABEL_W + LANE_MIN_W,
    height: ROW_H,
    position: 'relative',
    cursor: 'pointer',
    borderBottom: '1px solid',
    borderColor: 'divider',
    bgcolor: selected ? 'action.selected' : undefined,
    opacity: dimmed ? 0.35 : 1,
    '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
  }) as const;

export const label = {
  width: LABEL_W,
  flexShrink: 0,
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
  px: 1,
  borderRight: '1px solid',
  borderColor: 'divider',
  minWidth: 0,
} as const;

export const labelIcon = { display: 'flex', flexShrink: 0 } as const;

export const labelName = { flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, ...ellipsis } as const;

export const labelDuration = { flexShrink: 0, fontSize: 10, fontVariantNumeric: 'tabular-nums' } as const;

export const lane = { position: 'relative', flex: 1, minWidth: LANE_MIN_W, height: '100%' } as const;

export const bar = (running: boolean) =>
  ({
    position: 'absolute',
    top: (ROW_H - BAR_H) / 2,
    minWidth: 4,
    height: BAR_H,
    backgroundPosition: 'left center',
    // Running, the dashes march; finished, they rest.
    ...(running ? { '@keyframes wfDashMove': { from: { backgroundPositionX: '0px' }, to: { backgroundPositionX: '6px' } }, animation: 'wfDashMove 0.7s linear infinite' } : {}),
  }) as const;

/** The category icon in a ring: a bar's end cap, or an instant's whole glyph. */
export const marker = { width: 20, height: 20, borderRadius: '50%', bgcolor: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;

export const endCap = { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' } as const;

export const pointMarker = { position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)' } as const;

export const axisRow = { display: 'flex', alignItems: 'center', minWidth: LABEL_W + LANE_MIN_W, height: AXIS_H, borderTop: '1px solid', borderColor: 'divider' } as const;

export const axisLabelGutter = { width: LABEL_W, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', height: '100%' } as const;

export const axisLane = { position: 'relative', flex: 1, minWidth: LANE_MIN_W, height: '100%' } as const;

export const axisTick = { position: 'absolute', fontSize: 10, color: 'text.secondary', top: '50%', whiteSpace: 'nowrap' } as const;

export const gridline = { position: 'absolute', top: 0, bottom: 0, width: '1px', bgcolor: 'divider', opacity: 0.5 } as const;

export const liveCaption = { display: 'block', borderBottom: '1px solid', borderColor: 'divider', textAlign: 'right', color: 'text.secondary', px: 1, py: 0.5, fontSize: 11 } as const;
