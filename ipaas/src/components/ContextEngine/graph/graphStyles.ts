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

/** Styles shared by the Graph tab's canvas, panels and derivation. */

/** The canvas height: as tall as the window allows below the page's header, tabs and bar, within bounds, so the graph is in view without scrolling. */
export const GRAPH_HEIGHT = 'clamp(380px, calc(100vh - 440px), 600px)';

/** A short text on a link of the canvas: the relationship a fact names. */
export const linkTagSx = {
  fontSize: 10.5,
  lineHeight: 1.2,
  px: 0.75,
  py: 0.2,
  borderRadius: 1.25,
  border: '1px solid',
  borderColor: 'primary.light',
  bgcolor: 'background.paper',
  color: 'primary.main',
  whiteSpace: 'nowrap',
  maxWidth: 220,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

/** A note across the middle of a canvas, over the dimmed graph. */
export const canvasNoteSx = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  p: 3,
  pointerEvents: 'none',
} as const;

/** The right-hand panel; `lit` frames it in the accent, as when a node is selected. */
export const panelSx = (lit: boolean) =>
  ({
    border: '1px solid',
    borderColor: lit ? 'primary.main' : 'divider',
    boxShadow: lit ? (t: { palette: { primary: { main: string } } }) => `0 0 0 1px ${t.palette.primary.main}` : 'none',
    borderRadius: 1.5,
    bgcolor: 'background.paper',
    p: 2,
    display: 'flex',
    flexDirection: 'column',
    gap: 1.5,
    minWidth: 0,
  }) as const;

export const panelLabelSx = { fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.secondary' } as const;

/** An answer sentence lit as part of a derivation, as the Playground lights a cited sentence. */
export const sentenceSx = {
  fontSize: 13,
  lineHeight: 1.55,
  bgcolor: 'action.hover',
  boxShadow: (t: { palette: { primary: { main: string } } }) => `inset 0 -1px 0 ${t.palette.primary.main}`,
  borderRadius: 0.5,
  px: 0.5,
} as const;

/** The small legend over a canvas. */
export const legendSx = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 1.75,
  alignItems: 'center',
  fontSize: 12,
  color: 'text.secondary',
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  px: 1.25,
  py: 0.75,
} as const;

export const legendDotSx = (color: string, square = false) => ({ width: 10, height: 10, borderRadius: square ? '3px' : '50%', bgcolor: color, display: 'inline-block', flexShrink: 0 }) as const;

/** A node label over the canvas: quiet by default, framed when lit. */
export const nodeLabelSx = (lit: boolean, strong = false) =>
  ({
    mt: 1.25,
    px: 0.75,
    py: 0.125,
    borderRadius: 0.75,
    fontSize: strong ? 12.5 : 11.5,
    fontWeight: strong || lit ? 600 : 500,
    whiteSpace: 'nowrap',
    color: lit ? 'primary.main' : 'text.primary',
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: lit ? 'primary.main' : 'transparent',
    opacity: 0.94,
  }) as const;
