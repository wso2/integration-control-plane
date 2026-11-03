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

import { Box, ButtonBase, IconButton, Typography } from '@wso2/oxygen-ui';
import { Maximize2, Minus, Plus } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import type { Graph as CosmosGraph, GraphConfig } from '@cosmos.gl/graph';
import type { CosmosBuffers, LinkTag, Selection } from '../../../utils/contextGraph';
import { canvasNoteSx, linkTagSx } from './graphStyles';

/** How far the camera zooms in to frame a selection, so two close points never fill the canvas. */
const FRAME_MAX_ZOOM = 8;
const FRAME_PADDING = 0.25;
/** The screen length the nearer links of a framed selection get, so the relationship on each has room. */
const FRAME_LINK_PX = 150;
/** Which link counts as "nearer": this share of the way up the sorted distances. */
const FRAME_LINK_RANK = 0.25;
/**
 * The layout's forces (see the config below), checked on screenshots of a
 * made-up graph of 1 to 12 documents. The pull to a cluster's centre is
 * `CLUSTER_FORCE` times the point's own strength times its distance, with no
 * other factor, while the pull to the middle of the space is a tenth of
 * `GRAVITY` times the distance; so a small cluster force is already a firm one,
 * and ten times this value folds each group into a tight ball. Points push
 * apart by `REPULSION` over their distance. The layout runs `DECAY` ticks, one
 * per frame, and is all but still after a third of them.
 */
const CLUSTER_FORCE = 0.03;
const REPULSION = 1.5;
const GRAVITY = 0.02;
const LINK_DISTANCE = 14;
const LINK_SPRING = 0.7;
const FRICTION = 0.8;
const DECAY = 1200;
/**
 * The layout runs out of sight, many steps per frame, and is shown once its
 * energy (cosmos.gl's alpha, from 1 down to 0.001 over `DECAY` ticks) is below
 * this: by then the groups have formed, and what is left is a slow creep of
 * every point. A slow machine shows it after `ARRANGE_MAX_MS` whatever the energy.
 */
const SETTLE_ALPHA = 0.03;
const ARRANGE_MAX_MS = 8000;
/** How much of a frame the off-screen steps may take, so the page stays responsive meanwhile. */
const ARRANGE_FRAME_BUDGET_MS = 14;
/** A redrawn graph that kept most of its points runs with this much energy, so the new points find a place without the rest leaving theirs far behind. */
const PARTIAL_ALPHA = 0.3;
/**
 * Where each point of a layout ended up, by node key, kept per `layoutKey`
 * across redraws and across the Graph tab being closed and opened again, so the
 * graph is not laid out from scratch each time and a point stays where the
 * reader last saw it, or left it by dragging.
 */
const layoutMemory = new Map<string, Map<string, Point>>();
const NO_TAGS: LinkTag[] = [];
/** The reading-direction motion on a selected relationship: dots travel from subject to object. */
const FLOW_PERIOD_MS = 1800;
const FLOW_DOTS = 3;
const FLOW_RADIUS = 2.2;

type Point = [number, number];

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
  /** Short texts drawn at the middle of a link, such as the relationship a fact names. With `onSelectLink`, each is a button that selects its link. */
  linkTags?: LinkTag[];
  onSelect: (index: number | null) => void;
  onSelectLink?: (link: number) => void;
  onHover?: (index: number | null) => void;
  /** Accent for hover and focus rings, as a hex colour. */
  accent: string;
  /** A CSS height; labels and tags read the drawn size from the element. */
  height: number | string;
  ariaLabel: string;
  /** Drawn over the canvas: the legend in the bottom-left corner, or a note across the middle. */
  children?: ReactNode;
  /** Names the layout whose places are remembered between redraws and mounts, such as the engine's id. */
  layoutKey?: string;
}

type Rect = [number, number, number, number];

/**
 * The cosmos.gl canvas behind the Graph tab. The library is loaded only when a
 * graph is first drawn, so its WebGL code stays out of every other page. The
 * canvas draws points and links from flat buffers; labels and link tags are
 * ordinary DOM placed over the points it tracks, because the library draws
 * none and so they stay readable, clickable and reachable by keyboard. Their
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
  onSelectLink,
  onHover,
  accent,
  height,
  ariaLabel,
  children,
  layoutKey,
}: CosmosCanvasProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  // A plain 2D canvas over the WebGL one, for the motion that shows which way a relationship reads.
  const flowRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<CosmosGraph | null>(null);
  const frameRef = useRef<number | null>(null);
  const labelRefs = useRef(new Map<number, HTMLDivElement>());
  const tagRefs = useRef(new Map<number, HTMLDivElement>());
  const linksRef = useRef(buffers.links);
  linksRef.current = buffers.links;
  // Set once the reader zooms or drags: the camera is then theirs, and is not fitted again by itself.
  const userMovedRef = useRef(false);
  const framePointsRef = useRef(frame);
  framePointsRef.current = frame;
  const fitToRef = useRef(fitTo);
  fitToRef.current = fitTo;
  // How many points the graph holds right now. The library makes its position texture only once it has
  // a point, and reading positions back before then throws, so the camera is never fitted to no points.
  const pointCountRef = useRef(0);
  // A framing that arrives while the layout is still moving is run once it settles.
  const pendingFrameRef = useRef<(() => void) | null>(null);
  // The layout's current energy, and whether it is being arranged out of sight (see `SETTLE_ALPHA`).
  const alphaRef = useRef(0);
  const arrangingRef = useRef(false);
  const [arranging, setArranging] = useState(false);
  // The frame request of the off-screen arranging, so it can be stopped.
  const arrangeFrameRef = useRef<number | null>(null);
  // The node key of each point drawn now, in point order, and whether the library has drawn a frame
  // with them: positions read back before that are the previous points', under the wrong keys.
  const keysRef = useRef<string[]>([]);
  const placesFreshRef = useRef(false);
  const layoutKeyRef = useRef(layoutKey);
  layoutKeyRef.current = layoutKey;
  const lastFocusRef = useRef<number | null>(null);
  // Whether the last selection was framed as a set, with no focused point, such as a link.
  const lastFramedRef = useRef(false);
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const handlers = useRef({ onSelect, onSelectLink, onHover });
  handlers.current = { onSelect, onSelectLink, onHover };
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
      // While the layout is arranged out of sight, nothing is placed over it.
      if (arrangingRef.current) {
        labelRefs.current.forEach((el) => (el.style.visibility = 'hidden'));
        tagRefs.current.forEach((el) => (el.style.visibility = 'hidden'));
        return;
      }
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
        const spaceA = tracked.get(links[link * 2]);
        const spaceB = tracked.get(links[link * 2 + 1]);
        let shown = false;
        if (spaceA && spaceB) {
          const a = graph.spaceToScreenPosition(spaceA);
          const b = graph.spaceToScreenPosition(spaceB);
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

  /** The points' places right now, by node key; empty when the canvas has none to read. */
  const livePlaces = useCallback((): Map<string, Point> => {
    const graph = graphRef.current;
    const places = new Map<string, Point>();
    if (!graph || !pointCountRef.current || !placesFreshRef.current) return places;
    try {
      const all = graph.getPointPositions();
      keysRef.current.forEach((key, i) => {
        const x = all[i * 2];
        const y = all[i * 2 + 1];
        if (Number.isFinite(x) && Number.isFinite(y)) places.set(key, [x, y]);
      });
    } catch {
      // The library has no positions yet; there is nothing to remember.
    }
    return places;
  }, []);

  /** Keep where the points are now, for the next redraw or mount of this layout. */
  const rememberLayout = useCallback(() => {
    const key = layoutKeyRef.current;
    if (!key) return;
    const places = livePlaces();
    if (!places.size) return;
    const kept = layoutMemory.get(key) ?? new Map<string, Point>();
    places.forEach((place, node) => kept.set(node, place));
    layoutMemory.set(key, kept);
  }, [livePlaces]);

  // The whole graph, or the points given to fit, brought into view. A small set of points is not
  // blown up to fill the canvas: the padding grows so the zoom stays within half the framing cap,
  // and the points sit together in the middle with the rest of the graph around them.
  const fitAll = useCallback((duration: number) => {
    const graph = graphRef.current;
    const host = hostRef.current;
    const to = fitToRef.current;
    // With no points there is nothing to fit, and fitView would read positions the library never made.
    if (!graph || !pointCountRef.current) return;
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

  // Frame the focused point with its companions: close enough that the nearer links between them can
  // carry their text, or enough to fit them all when they are near, and never beyond the cap. Far
  // companions may leave the canvas; the fit button brings everything back.
  const frameFocus = useCallback((index: number) => {
    const graph = graphRef.current;
    const host = hostRef.current;
    if (!graph || !host || !pointCountRef.current) return;
    userMovedRef.current = true;
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
  }, []);

  // Frame a set of points with no focused one among them, such as the two ends of a selected link:
  // close enough that the nearer distances between them give a link room for its text, or enough
  // to fit them all, and never beyond the cap. The fit takes its zoom from its padding alone, so the
  // padding is worked out to give that zoom.
  const frameSet = useCallback((points: number[]) => {
    const graph = graphRef.current;
    const host = hostRef.current;
    if (!graph || !host || !points.length) return;
    userMovedRef.current = true;
    const all = graph.getPointPositions();
    const at = points.map((i): Point => [all[i * 2], all[i * 2 + 1]]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!at.length) return;
    const xs = at.map((p) => p[0]);
    const ys = at.map((p) => p[1]);
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1e-6);
    const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1e-6);
    const distances = at.flatMap((a, i) => at.slice(i + 1).map((b) => Math.hypot(b[0] - a[0], b[1] - a[1]))).sort((a, b) => a - b);
    const typical = Math.max(distances[Math.floor((distances.length - 1) * FRAME_LINK_RANK)] ?? 1e-6, 1e-6);
    const room = 1 - 2 * FRAME_PADDING;
    const fitAllZoom = Math.min((host.clientWidth * room) / spanX, (host.clientHeight * room) / spanY);
    const zoom = Math.min(FRAME_MAX_ZOOM, Math.max(FRAME_LINK_PX / typical, fitAllZoom));
    const padding = Math.min(0.46, Math.max(0, (1 - zoom * Math.max(spanX / host.clientWidth, spanY / host.clientHeight)) / 2));
    graph.fitViewByPointIndices(points, 600, padding, true);
  }, []);

  // The layout has come to rest: its places are kept, a framing that waited for it is run, or the
  // camera fits the whole picture once unless the reader has taken it over. Called by the library
  // when a run ends, and by hand for a redraw that had nothing to run.
  const settled = useCallback(() => {
    rememberLayout();
    const pending = pendingFrameRef.current;
    pendingFrameRef.current = null;
    if (pending) pending();
    // Fitted at once, not glided to: the picture is still, and so is the camera.
    else if (!userMovedRef.current) fitAll(0);
    scheduleLabels();
  }, [rememberLayout, fitAll, scheduleLabels]);

  const stopArranging = useCallback(() => {
    if (arrangeFrameRef.current !== null) window.cancelAnimationFrame(arrangeFrameRef.current);
    arrangeFrameRef.current = null;
    arrangingRef.current = false;
    setArranging(false);
  }, []);

  /**
   * Run the layout out of sight, as many steps per frame as the budget allows, until it has
   * settled (see `SETTLE_ALPHA`) or `ARRANGE_MAX_MS` have passed; then `done`. The library's
   * own loop is paused, so these are the only steps, and nothing of the run is seen: the graph
   * appears still, instead of spreading and drifting across the canvas for seconds.
   */
  const arrange = useCallback(
    (graph: CosmosGraph, done: () => void) => {
      stopArranging();
      graph.pause();
      arrangingRef.current = true;
      setArranging(true);
      const started = performance.now();
      const run = () => {
        arrangeFrameRef.current = null;
        if (graphRef.current !== graph) return;
        const frameStart = performance.now();
        do {
          graph.step();
          if (alphaRef.current < SETTLE_ALPHA || performance.now() - started > ARRANGE_MAX_MS) {
            done();
            return;
          }
        } while (performance.now() - frameStart < ARRANGE_FRAME_BUDGET_MS);
        arrangeFrameRef.current = window.requestAnimationFrame(run);
      };
      arrangeFrameRef.current = window.requestAnimationFrame(run);
    },
    [stopArranging],
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
          // Relationships carry an arrow at the object end (see `CosmosBuffers.arrows`); the other
          // lines have no direction, so none by default.
          linkDefaultArrows: false,
          linkArrowsSizeScale: 0.8,
          renderHoveredPointRing: true,
          hoveredPointRingColor: accent,
          focusedPointRingColor: accent,
          hoveredPointCursor: 'pointer',
          enableDrag: true,
          enableZoom: true,
          // The camera is fitted by hand, following the simulation.
          fitViewOnInit: false,
          // Points are placed, never glided: the library would otherwise animate every redraw for
          // 800 ms, which reads as the graph moving by itself.
          transitionDuration: 0,
          fitViewPadding: 0.15,
          // Fading long links keeps a dense graph readable without hiding its structure.
          linkVisibilityMinTransparency: 0.15,
          // Each document and the entities it names are pulled gently to a centre of their own, spread
          // over the space (see `clusterLayout`), so the canvas fills evenly instead of knotting in the
          // middle. Points push apart firmly and are hardly pulled to the middle at all, so each group
          // opens into a loose cloud; the friction settles it instead of letting it swing.
          simulationCluster: CLUSTER_FORCE,
          simulationRepulsion: REPULSION,
          simulationGravity: GRAVITY,
          simulationLinkDistance: LINK_DISTANCE,
          simulationLinkSpring: LINK_SPRING,
          simulationFriction: FRICTION,
          simulationDecay: DECAY,
          simulationCollision: 1,
          simulationCollisionPadding: 1.5,
          onPointClick: (index) => handlers.current.onSelect(index),
          onBackgroundClick: () => handlers.current.onSelect(null),
          onPointMouseOver: (index) => handlers.current.onHover?.(index),
          onPointMouseOut: () => handlers.current.onHover?.(null),
          onSimulationTick: (alpha) => {
            alphaRef.current = alpha;
            scheduleLabels();
          },
          onZoom: scheduleLabels,
          // A reader who zooms or drags takes over: the follow stops at its next tick, and a frame
          // waiting for the simulation to end is dropped, so the camera stays where the reader put it.
          onZoomStart: (_event, userDriven) => {
            if (userDriven) {
              userMovedRef.current = true;
              pendingFrameRef.current = null;
            }
          },
          onDragStart: () => {
            userMovedRef.current = true;
            pendingFrameRef.current = null;
          },
          // A point the reader dragged stays where they left it, also after a redraw.
          onDragEnd: rememberLayout,
          onTransition: scheduleLabels,
          onSimulationEnd: settled,
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
      stopArranging();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      // Closing the tab keeps the layout, so opening it again shows the same picture at once.
      rememberLayout();
      graph?.destroy();
      graphRef.current = null;
      setReady(false);
    };
    // The canvas is built once; data and selection change through the effects below.
  }, [accent, scheduleLabels, stopArranging, fitAll, rememberLayout, settled]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !ready) return;
    // A point that was drawn before, here or in an earlier mount of this layout, keeps its place:
    // only the points new to the picture start from their seeded spots. A graph that kept most of
    // its points is not laid out from scratch again, and one that kept them all does not move at all.
    rememberLayout();
    const known = new Map<string, Point>(layoutKey ? layoutMemory.get(layoutKey) : undefined);
    livePlaces().forEach((place, key) => known.set(key, place));
    const positions = Float32Array.from(buffers.positions);
    let kept = 0;
    buffers.keys.forEach((key, i) => {
      const place = known.get(key);
      if (!place) return;
      positions[i * 2] = place[0];
      positions[i * 2 + 1] = place[1];
      kept += 1;
    });
    const count = buffers.keys.length;
    const fresh = kept < count / 2;
    keysRef.current = buffers.keys;
    pointCountRef.current = count;
    placesFreshRef.current = false;
    graph.setPointPositions(positions, true);
    graph.setPointColors(buffers.colors);
    graph.setPointSizes(buffers.sizes);
    graph.setPointShapes(buffers.shapes);
    graph.setLinks(buffers.links);
    graph.setLinkColors(buffers.linkColors);
    graph.setLinkWidths(buffers.linkWidths);
    graph.setLinkArrows(buffers.arrows);
    graph.setLinkStrength(buffers.linkStrengths);
    // Every document's group has a centre of its own; a point in no group is left to the other forces.
    graph.setPointClusters(buffers.clusters);
    graph.setClusterPositions(buffers.clusterPositions);
    graph.setPointClusterStrength(buffers.clusterStrengths);
    const alpha = fresh ? 1 : kept === count ? 0 : PARTIAL_ALPHA;
    // `render` takes the data and sets the energy; the steps themselves are run out of sight.
    graph.render(alpha);
    // The library draws the new points on its next frame; positions read back before then are stale.
    const shown = (run: () => void) =>
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          if (graphRef.current !== graph || keysRef.current !== buffers.keys) return;
          placesFreshRef.current = true;
          run();
        }),
      );
    if (alpha > 0 && count) {
      arrange(graph, () => {
        graph.render(0);
        shown(() => {
          stopArranging();
          settled();
        });
      });
    } else {
      // Nothing to run: every point has its place, or there are none. The library's own loop is
      // paused too, so it does not end a run of its own and settle this twice.
      stopArranging();
      graph.pause();
      shown(settled);
    }
    scheduleLabels();
  }, [buffers, ready, layoutKey, arrange, stopArranging, livePlaces, rememberLayout, settled, scheduleLabels]);

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
    // The selected relationships' ends too, so the reading-direction motion can place its dots.
    const flowing = (selection?.links ?? []).filter((link) => buffers.arrows[link]).flatMap((link) => [buffers.links[link * 2], buffers.links[link * 2 + 1]]);
    graph.trackPointPositionsByIndices([...new Set([...labels, ...ends, ...flowing])]);
    scheduleLabels();
  }, [labels, linkTags, selection, buffers, ready, scheduleLabels]);

  // Which way a selected relationship reads: small dots run from its subject to its object, on top
  // of the arrow head, while something is selected. Arrows alone are easy to miss on a dense graph,
  // and a reader who takes the object for the subject reads the fact backwards. Off when the reader
  // asked the system for less motion; the arrows stay.
  useEffect(() => {
    const canvas = flowRef.current;
    const graph = graphRef.current;
    const host = hostRef.current;
    if (!canvas || !graph || !host || !ready) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const clear = () => context.clearRect(0, 0, canvas.width, canvas.height);
    const links = (selection?.links ?? []).filter((link) => buffers.arrows[link]);
    const lessMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!links.length || lessMotion) {
      clear();
      return;
    }
    const started = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(host.clientWidth * dpr);
      const height = Math.round(host.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      clear();
      const tracked = graph.getTrackedPointPositionsMap();
      const phase = ((now - started) / FLOW_PERIOD_MS) % 1;
      context.fillStyle = accent;
      for (const link of links) {
        const from = tracked.get(buffers.links[link * 2]);
        const to = tracked.get(buffers.links[link * 2 + 1]);
        if (!from || !to) continue;
        const a = graph.spaceToScreenPosition(from);
        const b = graph.spaceToScreenPosition(to);
        for (let k = 0; k < FLOW_DOTS; k += 1) {
          const along = (phase + k / FLOW_DOTS) % 1;
          // Brighter towards the object end, so even a still frame reads in the right direction.
          context.globalAlpha = 0.3 + 0.7 * along;
          context.beginPath();
          context.arc((a[0] + (b[0] - a[0]) * along) * dpr, (a[1] + (b[1] - a[1]) * along) * dpr, FLOW_RADIUS * dpr, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      clear();
    };
  }, [selection, buffers, ready, accent]);

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

  // The camera follows the selection: a focused point is framed with its companions; a selection with
  // no focused point, such as a link, is framed as a set; releasing either shows the whole graph again.
  // The set's key changes only when it matters, so a node's changing neighbourhood does not refit.
  const frameKey = focused === null && frame && frame.length ? frame.join(',') : '';
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !ready) return;
    const had = lastFocusRef.current !== null || lastFramedRef.current;
    lastFocusRef.current = focused;
    lastFramedRef.current = frameKey !== '';
    // Still being arranged out of sight: frame once it is shown, so the camera lands on the final layout.
    const once = (run: () => void) => {
      if (arrangingRef.current) pendingFrameRef.current = run;
      else run();
    };
    if (focused !== null) once(() => frameFocus(focused));
    else if (frameKey) once(() => frameSet(framePointsRef.current ?? []));
    else if (had) {
      pendingFrameRef.current = null;
      userMovedRef.current = true;
      fitAll(600);
    }
  }, [focused, frameKey, ready, frameFocus, frameSet, fitAll]);

  const zoom = (factor: number) => {
    const graph = graphRef.current;
    if (!graph) return;
    userMovedRef.current = true;
    pendingFrameRef.current = null;
    graph.setZoomLevel(graph.getZoomLevel() * factor, 250, true);
  };
  const fit = () => {
    userMovedRef.current = true;
    pendingFrameRef.current = null;
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
      <Box ref={hostRef} sx={{ position: 'absolute', inset: 0, opacity: arranging ? 0 : 1, '& canvas': { display: 'block' } }} />
      <Box component="canvas" ref={flowRef} aria-hidden sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: arranging ? 0 : 1 }} />
      {arranging && !failed && (
        <Box sx={canvasNoteSx}>
          <Typography variant="caption" color="text.secondary">
            Arranging the graph…
          </Typography>
        </Box>
      )}
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
            <Box key={tag.link} ref={(el: HTMLDivElement | null) => placeTag(tag.link, el)} sx={{ ...floating, '& > *': { pointerEvents: onSelectLink ? 'auto' : 'none' } }}>
              {onSelectLink ? (
                <ButtonBase
                  onClick={() => handlers.current.onSelectLink?.(tag.link)}
                  title={tag.detail ?? tag.text}
                  aria-label={`${tag.text}: select this ${tag.tone === 'conflict' ? 'conflict' : 'relationship'}`}
                  aria-pressed={!!tag.lit}
                  sx={linkTagSx(tag.tone, tag.lit)}>
                  {tag.text}
                </ButtonBase>
              ) : (
                <Box sx={linkTagSx(tag.tone, tag.lit)} title={tag.detail ?? tag.text}>
                  {tag.text}
                </Box>
              )}
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
