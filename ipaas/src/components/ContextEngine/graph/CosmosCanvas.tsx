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

import { Box, IconButton, Typography } from '@wso2/oxygen-ui';
import { Maximize2, Minus, Plus } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import type { Graph as CosmosGraph, GraphConfig } from '@cosmos.gl/graph';
import type { CosmosBuffers, LinkTag, Selection } from '../../../utils/contextGraph';
import { linkTagSx } from './graphStyles';

/** How often the camera refits while the layout is still moving, in milliseconds. */
const FOLLOW_EVERY = 450;
/** How far the camera zooms in to frame a selection, so two close points never fill the canvas. */
const FRAME_MAX_ZOOM = 8;
const FRAME_PADDING = 0.25;
/** The screen length the nearer links of a framed selection get, so the relationship on each has room. */
const FRAME_LINK_PX = 150;
/** Which link counts as "nearer": this share of the way up the sorted distances. */
const FRAME_LINK_RANK = 0.25;
const NO_TAGS: LinkTag[] = [];

interface CosmosCanvasProps {
  buffers: CosmosBuffers;
  /** Point colours to draw instead of the buffers' own, as when an answer's entities are lit. */
  pointColors?: Float32Array | null;
  /** Link colours to draw instead of the buffers' own, as when a selection lights its links. */
  linkColors?: Float32Array | null;
  /** Lit points and links; the rest grey out. Null shows everything normally. */
  selection: Selection | null;
  /** The point with the focus ring. Whenever it changes, the camera frames `frame` (or the point itself); when it is released, the whole graph again. */
  focused: number | null;
  /** The points to bring into view with the focused one, such as its neighbourhood. */
  frame?: number[] | null;
  /** The points the camera fits as the layout settles; every point when absent. */
  fitTo?: number[] | null;
  /** Points that get a label over the canvas, drawn by `renderLabel` at the point's screen position, first the ones that matter most. */
  labels: number[];
  renderLabel: (index: number) => ReactNode;
  /** Short texts drawn at the middle of a link, such as the relationship a fact names. */
  linkTags?: LinkTag[];
  onSelect: (index: number | null) => void;
  onHover?: (index: number | null) => void;
  /** Accent for hover and focus rings, as a hex colour. */
  accent: string;
  /** A CSS height; labels and tags read the drawn size from the element. */
  height: number | string;
  ariaLabel: string;
  /** Drawn over the canvas: the legend in the bottom-left corner, or a note across the middle. */
  children?: ReactNode;
}

type Rect = [number, number, number, number];

/**
 * The cosmos.gl canvas behind the Graph tab. The library is loaded only when a
 * graph is first drawn, so its WebGL code stays out of every other page. The
 * canvas draws points and links from flat buffers; labels and link tags are
 * ordinary DOM placed over the points it tracks, because the library draws
 * none and so they stay readable, selectable and reachable by keyboard. Their
 * positions are set straight on the elements once per frame, so React does
 * not render on every tick of the simulation. A browser without WebGL gets a
 * short note instead.
 */
export default function CosmosCanvas({
  buffers,
  pointColors = null,
  linkColors = null,
  selection,
  focused,
  frame = null,
  fitTo = null,
  labels,
  renderLabel,
  linkTags = NO_TAGS,
  onSelect,
  onHover,
  accent,
  height,
  ariaLabel,
  children,
}: CosmosCanvasProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<CosmosGraph | null>(null);
  const frameRef = useRef<number | null>(null);
  const labelRefs = useRef(new Map<number, HTMLDivElement>());
  const tagRefs = useRef(new Map<number, HTMLDivElement>());
  const linksRef = useRef(buffers.links);
  linksRef.current = buffers.links;
  // cosmos.gl reads point positions from a GPU buffer it only creates once there are points, so
  // fitting or framing an empty graph throws; the camera is left alone until something is drawn.
  const hasPointsRef = useRef(buffers.positions.length > 0);
  hasPointsRef.current = buffers.positions.length > 0;
  const followRef = useRef<number | null>(null);
  // Set once the reader zooms or drags: the camera then stops following the layout.
  const userMovedRef = useRef(false);
  const framePointsRef = useRef(frame);
  framePointsRef.current = frame;
  const fitToRef = useRef(fitTo);
  fitToRef.current = fitTo;
  // A focus that arrives while the layout is still moving is framed once it settles.
  const pendingFrameRef = useRef<number | null>(null);
  const lastFocusRef = useRef<number | null>(null);
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const handlers = useRef({ onSelect, onHover });
  handlers.current = { onSelect, onHover };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Labels follow their points and tags their links: once per frame while anything moves, each is
  // moved to its screen position. Sizes are read first and styles written after, so the browser lays
  // the page out once. Labels go first, in priority order, then tags; one that finds no free spot is
  // hidden.
  const scheduleLabels = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const graph = graphRef.current;
      const host = hostRef.current;
      if (!graph || !host) return;
      const tracked = graph.getTrackedPointPositionsMap();
      const { clientWidth, clientHeight } = host;
      const screen = (index: number): [number, number] | null => {
        const space = tracked.get(index);
        return space ? graph.spaceToScreenPosition(space) : null;
      };
      const measure = (el: HTMLDivElement) => {
        const box = el.firstElementChild as HTMLElement | null;
        // `mt` is the gap the box keeps from its point; `h` spans the gap and the box.
        return { w: box?.offsetWidth ?? 0, h: (box?.offsetHeight ?? 0) + (box?.offsetTop ?? 0), mt: box?.offsetTop ?? 0 };
      };
      const measuredLabels = [...labelRefs.current].map(([index, el]) => ({ index, el, ...measure(el) }));
      const measuredTags = [...tagRefs.current].map(([link, el]) => ({ link, el, ...measure(el) }));
      // The focused point's label goes first, then the tags, then every other label.
      const focusedIndex = focusedRef.current;
      const firstLabels = measuredLabels.filter((l) => l.index === focusedIndex);
      const otherLabels = measuredLabels.filter((l) => l.index !== focusedIndex);
      const placed: Rect[] = [];
      const fits = (rect: Rect, inside: boolean) => {
        if (!inside || placed.some(([l, t, r, b]) => rect[0] < r && rect[2] > l && rect[1] < b && rect[3] > t)) return false;
        placed.push(rect);
        return true;
      };
      const inside = (x: number, y: number) => x >= 0 && x <= clientWidth && y >= 0 && y <= clientHeight;
      // The tracked points themselves are kept clear, so no label or tag covers a node.
      tracked.forEach((space) => {
        const [x, y] = graph.spaceToScreenPosition(space);
        placed.push([x - 8, y - 8, x + 8, y + 8]);
      });
      // A label sits under its point, or over it, or beside it, whichever is free first.
      const placeLabels = (list: typeof measuredLabels) => {
        for (const { index, el, w, h, mt } of list) {
          const at = screen(index);
          let shown = false;
          if (at) {
            const [x, y] = at;
            const side = y - h / 2 - 5;
            const spots: Array<[number, number, boolean]> = [
              [x, y, true],
              [x, y - h - 8, true],
              [x + 10, side, false],
              [x - 10 - w - 4, side, false],
            ];
            for (const [left, top, centred] of spots) {
              const rect: Rect = centred ? [left - w / 2 - 2, top + mt, left + w / 2 + 2, top + h] : [left, top + mt, left + w + 4, top + h];
              if (!fits(rect, inside(x, y))) continue;
              el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)${centred ? ' translateX(-50%)' : ''}`;
              shown = true;
              break;
            }
          }
          el.style.visibility = shown ? 'visible' : 'hidden';
        }
      };
      placeLabels(firstLabels);
      // A tag sits at the middle of its link, or further along it, or a little beside it, whichever is free first.
      const links = linksRef.current;
      for (const { link, el, w, h } of measuredTags) {
        const a = screen(links[link * 2]);
        const b = screen(links[link * 2 + 1]);
        let shown = false;
        if (a && b) {
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const nx = -(b[1] - a[1]) / len;
          const ny = (b[0] - a[0]) / len;
          outer: for (const off of [0, 14, -14]) {
            for (const t of [0.5, 0.38, 0.62, 0.26, 0.74]) {
              const x = a[0] + (b[0] - a[0]) * t + nx * off;
              const y = a[1] + (b[1] - a[1]) * t + ny * off;
              if (!fits([x - w / 2 - 2, y - h / 2, x + w / 2 + 2, y + h / 2], inside(x, y))) continue;
              el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
              shown = true;
              break outer;
            }
          }
        }
        el.style.visibility = shown ? 'visible' : 'hidden';
      }
      placeLabels(otherLabels);
    });
  }, []);

  const stopFollowing = useCallback(() => {
    if (followRef.current !== null) window.clearInterval(followRef.current);
    followRef.current = null;
  }, []);

  // The whole graph, or the points given to fit, brought into view. A small set of points is not
  // blown up to fill the canvas: the padding grows so the zoom stays within half the framing cap,
  // and the points sit together in the middle with the rest of the graph around them.
  const fitAll = useCallback((duration: number) => {
    const graph = graphRef.current;
    const host = hostRef.current;
    const to = fitToRef.current;
    if (!graph || !hasPointsRef.current) return;
    if (!to || !to.length || !host) {
      graph.fitView(duration, 0.15, true);
      return;
    }
    const all = graph.getPointPositions();
    const xs = to.map((i) => all[i * 2]).filter(Number.isFinite);
    const ys = to.map((i) => all[i * 2 + 1]).filter(Number.isFinite);
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1e-6);
    const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1e-6);
    const cap = FRAME_MAX_ZOOM / 2;
    const atDefault = Math.min((host.clientWidth * (1 - 2 * FRAME_PADDING)) / spanX, (host.clientHeight * (1 - 2 * FRAME_PADDING)) / spanY);
    const padding = atDefault > cap ? Math.min(0.46, (1 - cap * Math.max(spanX / host.clientWidth, spanY / host.clientHeight)) / 2) : FRAME_PADDING;
    graph.fitViewByPointIndices(to, duration, padding, true);
  }, []);

  // While the simulation lays the graph out, refit the camera a little at a time so the view
  // grows with it instead of jumping; a reader who zooms or drags takes over.
  const follow = useCallback(() => {
    stopFollowing();
    userMovedRef.current = false;
    fitAll(FOLLOW_EVERY);
    followRef.current = window.setInterval(() => {
      const graph = graphRef.current;
      if (!graph || userMovedRef.current || !graph.isSimulationRunning) {
        stopFollowing();
        return;
      }
      fitAll(FOLLOW_EVERY);
    }, FOLLOW_EVERY);
  }, [stopFollowing, fitAll]);

  // Frame the focused point with its companions: close enough that the nearer links between them can
  // carry their text, or enough to fit them all when they are near, and never beyond the cap. Far
  // companions may leave the canvas; the fit button brings everything back.
  const frameFocus = useCallback(
    (index: number) => {
      const graph = graphRef.current;
      const host = hostRef.current;
      if (!graph || !host || !hasPointsRef.current) return;
      userMovedRef.current = true;
      stopFollowing();
      const points = framePointsRef.current && framePointsRef.current.length ? framePointsRef.current : [index];
      const all = graph.getPointPositions();
      const at = (i: number): [number, number] | null => {
        const x = all[i * 2];
        const y = all[i * 2 + 1];
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
      };
      const centre = at(index);
      const others = points
        .filter((i) => i !== index)
        .map(at)
        .filter((p): p is [number, number] => !!p);
      let zoom = FRAME_MAX_ZOOM;
      if (centre && others.length) {
        const distances = others.map(([x, y]) => Math.hypot(x - centre[0], y - centre[1])).sort((a, b) => a - b);
        const typical = Math.max(distances[Math.floor((distances.length - 1) * FRAME_LINK_RANK)], 1e-6);
        const spanX = Math.max(...others.map((p) => Math.abs(p[0] - centre[0])), 1e-6);
        const spanY = Math.max(...others.map((p) => Math.abs(p[1] - centre[1])), 1e-6);
        const room = 1 - 2 * FRAME_PADDING;
        const fitAllZoom = Math.min((host.clientWidth * room) / 2 / spanX, (host.clientHeight * room) / 2 / spanY);
        zoom = Math.min(FRAME_MAX_ZOOM, Math.max(FRAME_LINK_PX / typical, fitAllZoom));
      }
      graph.zoomToPointByIndex(index, 600, zoom, true, true);
    },
    [stopFollowing],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let graph: CosmosGraph | null = null;
    import('@cosmos.gl/graph')
      .then(async ({ Graph }) => {
        if (cancelled) return;
        const config: Partial<GraphConfig> = {
          backgroundColor: [0, 0, 0, 0],
          enableSimulation: true,
          spaceSize: 4096,
          rescalePositions: false,
          pointSizeScale: 1,
          scalePointsOnZoom: false,
          pointGreyoutOpacity: 0.12,
          linkGreyoutOpacity: 0.06,
          linkDefaultArrows: false,
          renderHoveredPointRing: true,
          hoveredPointRingColor: accent,
          focusedPointRingColor: accent,
          hoveredPointCursor: 'pointer',
          enableDrag: true,
          enableZoom: true,
          // The camera is fitted by hand, following the simulation.
          fitViewOnInit: false,
          fitViewPadding: 0.15,
          // Fading long links keeps a dense graph readable without hiding its structure.
          linkVisibilityMinTransparency: 0.15,
          // Gentle forces and quick damping: the layout spreads out once and settles instead of swinging.
          simulationRepulsion: 0.3,
          simulationLinkDistance: 12,
          simulationLinkSpring: 0.7,
          simulationGravity: 0.3,
          simulationFriction: 0.8,
          simulationDecay: 2500,
          simulationCollision: 1,
          simulationCollisionPadding: 1.5,
          onPointClick: (index) => handlers.current.onSelect(index),
          onBackgroundClick: () => handlers.current.onSelect(null),
          onPointMouseOver: (index) => handlers.current.onHover?.(index),
          onPointMouseOut: () => handlers.current.onHover?.(null),
          onSimulationTick: scheduleLabels,
          onZoom: scheduleLabels,
          onZoomStart: (_event, userDriven) => {
            if (userDriven) userMovedRef.current = true;
          },
          onDragStart: () => {
            userMovedRef.current = true;
          },
          onTransition: scheduleLabels,
          onSimulationEnd: () => {
            stopFollowing();
            if (pendingFrameRef.current !== null) {
              frameFocus(pendingFrameRef.current);
              pendingFrameRef.current = null;
            } else if (!userMovedRef.current) fitAll(600);
            scheduleLabels();
          },
        };
        graph = new Graph(host as HTMLDivElement, config as GraphConfig);
        graphRef.current = graph;
        await graph.ready;
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      stopFollowing();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      graph?.destroy();
      graphRef.current = null;
      setReady(false);
    };
    // The canvas is built once; data and selection change through the effects below.
  }, [accent, scheduleLabels, stopFollowing, fitAll, frameFocus]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !ready) return;
    graph.setPointPositions(buffers.positions, true);
    graph.setPointColors(buffers.colors);
    graph.setPointSizes(buffers.sizes);
    graph.setPointShapes(buffers.shapes);
    graph.setLinks(buffers.links);
    graph.setLinkColors(buffers.linkColors);
    graph.setLinkWidths(buffers.linkWidths);
    graph.render(1);
    follow();
    scheduleLabels();
  }, [buffers, ready, follow, scheduleLabels]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !ready) return;
    graph.setPointColors(pointColors ?? buffers.colors);
    graph.setLinkColors(linkColors ?? buffers.linkColors);
    // No alpha: the simulation keeps its pace, and nothing transitions.
    graph.render(undefined, 0);
  }, [pointColors, linkColors, buffers, ready]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !ready) return;
    const ends = linkTags.flatMap((tag) => [buffers.links[tag.link * 2], buffers.links[tag.link * 2 + 1]]);
    graph.trackPointPositionsByIndices([...new Set([...labels, ...ends])]);
    scheduleLabels();
  }, [labels, linkTags, buffers, ready, scheduleLabels]);

  const placeLabel = useCallback(
    (index: number, el: HTMLDivElement | null) => {
      if (el) labelRefs.current.set(index, el);
      else labelRefs.current.delete(index);
      scheduleLabels();
    },
    [scheduleLabels],
  );
  const placeTag = useCallback(
    (link: number, el: HTMLDivElement | null) => {
      if (el) tagRefs.current.set(link, el);
      else tagRefs.current.delete(link);
      scheduleLabels();
    },
    [scheduleLabels],
  );

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !ready) return;
    graph.setConfigPartial({
      highlightedPointIndices: selection ? selection.points : undefined,
      highlightedLinkIndices: selection ? selection.links : undefined,
      focusedPointIndex: focused ?? undefined,
    });
  }, [selection, focused, ready]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !ready) return;
    const was = lastFocusRef.current;
    lastFocusRef.current = focused;
    if (focused !== null) {
      // Still settling: frame it when the simulation ends, so the camera lands on the final layout.
      if (graph.isSimulationRunning && followRef.current !== null) pendingFrameRef.current = focused;
      else frameFocus(focused);
    } else if (was !== null) {
      pendingFrameRef.current = null;
      userMovedRef.current = true;
      stopFollowing();
      fitAll(600);
    }
  }, [focused, ready, frameFocus, fitAll, stopFollowing]);

  const zoom = (factor: number) => {
    const graph = graphRef.current;
    if (!graph) return;
    userMovedRef.current = true;
    stopFollowing();
    graph.setZoomLevel(graph.getZoomLevel() * factor, 250, true);
  };
  const fit = () => {
    userMovedRef.current = true;
    stopFollowing();
    fitAll(400);
  };

  const floating = { position: 'absolute', left: 0, top: 0, visibility: 'hidden', willChange: 'transform', pointerEvents: 'none' } as const;

  return (
    <Box
      role="group"
      aria-label={ariaLabel}
      sx={{
        position: 'relative',
        height,
        overflow: 'hidden',
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(120,124,140,0.18) 1px, transparent 1.2px)',
        backgroundSize: '22px 22px',
      }}>
      <Box ref={hostRef} sx={{ position: 'absolute', inset: 0, '& canvas': { display: 'block' } }} />
      {failed ? (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 360 }}>
            This browser can’t draw the graph: it needs WebGL 2. The panel beside it still lists everything shown here.
          </Typography>
        </Box>
      ) : (
        <>
          {labels.map((index) => (
            <Box key={index} ref={(el: HTMLDivElement | null) => placeLabel(index, el)} sx={{ ...floating, '& > *': { pointerEvents: 'auto' } }}>
              {renderLabel(index)}
            </Box>
          ))}
          {linkTags.map((tag) => (
            <Box key={tag.link} ref={(el: HTMLDivElement | null) => placeTag(tag.link, el)} sx={floating}>
              <Box sx={linkTagSx} title={tag.detail ?? tag.text}>
                {tag.text}
              </Box>
            </Box>
          ))}
        </>
      )}
      {!failed && (
        <Box sx={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <IconButton size="small" aria-label="Zoom in" onClick={() => zoom(1.4)} sx={controlSx}>
            <Plus size={16} />
          </IconButton>
          <IconButton size="small" aria-label="Zoom out" onClick={() => zoom(1 / 1.4)} sx={controlSx}>
            <Minus size={16} />
          </IconButton>
          <IconButton size="small" aria-label="Fit the graph" onClick={fit} sx={controlSx}>
            <Maximize2 size={16} />
          </IconButton>
        </Box>
      )}
      {children}
    </Box>
  );
}

const controlSx = { width: 34, height: 34, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', '&:hover': { bgcolor: 'action.hover' } } as const;
