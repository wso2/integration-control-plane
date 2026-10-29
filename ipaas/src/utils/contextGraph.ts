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

/**
 * Pure helpers for the Graph tab: the explore model of the engine's graph and
 * the buffers the canvas draws from, search and neighbourhood selection, and
 * the part of the graph an answer's facts used. They hold no WebGL, so they
 * can be tested on their own.
 */

import { splitSentences } from './contextEngine';
import type { ContextFact, ContextGraph, ContextGraphConflict, ContextGraphRecord, ContextGraphRelation, ContextQueryConflict, ContextQueryResult } from '../types/contextEngine';

export type GraphNodeKind = 'record' | 'entity';

export interface GraphNode {
  /** Stable key: the engine's graph id. */
  key: string;
  kind: GraphNodeKind;
  label: string;
  /** Point size before zoom. */
  size: number;
  /** Entity mentions: the chunks naming it. */
  weight?: number;
  /** The entity's kind, as the language model wrote it; absent for records and for an entity written without one. */
  entityKind?: string;
  /**
   * The document the node sits with in the layout, by the record's graph id: a
   * record sits with itself, an entity with the record shown that names it in
   * the most chunks. Absent when no record shown names it.
   */
  group?: string;
  /** For an entity: how many of the records shown name it. */
  documents?: number;
}

/** A document line, a relationship, or a conflict the engine's contradiction check drew between two entities that differ. */
export type GraphLinkKind = 'mentions' | 'relates' | 'conflicts';

export interface GraphLink {
  source: number;
  target: number;
  kind: GraphLinkKind;
  /** The relationship, for `relates` links, or "contradicts" for a conflict: the short label drawn on the link. */
  label?: string;
  /** The relationship as one sentence, when the engine has one, or a conflict's reason; it keeps what the label can lose, such as a "not". */
  text?: string;
}

export interface GraphModel {
  nodes: GraphNode[];
  links: GraphLink[];
  /** Node index by key. */
  index: Map<string, number>;
}

function model(): GraphModel {
  return { nodes: [], links: [], index: new Map() };
}

function addNode(m: GraphModel, node: GraphNode): number {
  const known = m.index.get(node.key);
  if (known !== undefined) return known;
  m.nodes.push(node);
  m.index.set(node.key, m.nodes.length - 1);
  return m.nodes.length - 1;
}

function addLink(m: GraphModel, link: GraphLink, seen: Set<string>): number {
  const key = `${link.kind}:${link.source}:${link.target}:${link.label ?? ''}`;
  if (seen.has(key)) return m.links.findIndex((l) => `${l.kind}:${l.source}:${l.target}:${l.label ?? ''}` === key);
  seen.add(key);
  m.links.push(link);
  return m.links.length - 1;
}

/** An entity's point grows with the chunks that name it, within bounds, so a name the sources dwell on stands out. */
export function entitySize(mentions: number): number {
  return Math.min(16, Math.max(4, 4 + 2 * Math.sqrt(Math.max(0, mentions))));
}

export const RECORD_SIZE = 9;

export type ExploreDetail = 'key' | 'all';

export interface ExploreFilter {
  records: boolean;
  entities: boolean;
  /** `key` draws only the entities that stand out (see `isKeyEntity`); `all` draws every entity served. */
  detail: ExploreDetail;
  /** Entity names, in lower case, drawn whatever the detail: the ones an answer's facts name. */
  keepNames?: Set<string>;
  /** Only records of this source, and what they name; absent for every source. */
  sourceId?: string;
}

/** Key entities, the default view: named in more than one chunk, or in at least `KEY_DEGREE` relationships. Most entities are named once and linked once, and drawing them all hides the rest. */
export const KEY_DEGREE = 3;

export function isKeyEntity(mentions: number, degree: number): boolean {
  return mentions >= 2 || degree >= KEY_DEGREE;
}

/**
 * The graph as the Graph tab explores it: records first, then entities, so the
 * index ranges say the kind. A mention or relationship is drawn only when both
 * its ends are; with a source filter, entities and relationships come only
 * from that source's records.
 */
export function exploreModel(graph: ContextGraph, filter: ExploreFilter, recordLabel: (record: ContextGraphRecord) => string = (r) => r.recordId): GraphModel {
  const m = model();
  const seen = new Set<string>();
  const kept = new Set(graph.records.filter((r) => !filter.sourceId || r.sourceId === filter.sourceId).map((r) => r.id));
  // For each entity, the chunks of each kept record naming it.
  const byEntity = new Map<string, Map<string, number>>();
  for (const mention of graph.mentions) {
    if (!kept.has(mention.recordNodeId)) continue;
    const records = byEntity.get(mention.entityId) ?? new Map<string, number>();
    records.set(mention.recordNodeId, (records.get(mention.recordNodeId) ?? 0) + mention.chunks);
    byEntity.set(mention.entityId, records);
  }
  // The record naming an entity the most, the first of them when two tie.
  const home = (entityId: string): string | undefined => {
    let best: string | undefined;
    let most = 0;
    for (const [recordId, chunks] of byEntity.get(entityId) ?? []) {
      if (chunks > most) {
        best = recordId;
        most = chunks;
      }
    }
    return best;
  };
  const relations = graph.relations.filter((r) => !filter.sourceId || r.recordNodeIds.some((id) => kept.has(id)));
  const named = new Set([...byEntity.keys(), ...relations.flatMap((r) => [r.subjectId, r.objectId])]);
  const degree = new Map<string, number>();
  for (const relation of relations) {
    degree.set(relation.subjectId, (degree.get(relation.subjectId) ?? 0) + 1);
    degree.set(relation.objectId, (degree.get(relation.objectId) ?? 0) + 1);
  }
  if (filter.records) {
    for (const record of graph.records) {
      if (kept.has(record.id)) addNode(m, { key: record.id, kind: 'record', label: recordLabel(record), size: RECORD_SIZE, group: record.id });
    }
  }
  if (filter.entities) {
    for (const entity of graph.entities) {
      if (filter.sourceId && !named.has(entity.id)) continue;
      if (filter.detail === 'key' && !isKeyEntity(entity.mentions, degree.get(entity.id) ?? 0) && !filter.keepNames?.has(entity.name.toLowerCase())) continue;
      const group = home(entity.id);
      addNode(m, {
        key: entity.id,
        kind: 'entity',
        label: entity.name,
        size: entitySize(entity.mentions),
        weight: entity.mentions,
        ...(entity.kind ? { entityKind: entity.kind } : {}),
        ...(group ? { group, documents: byEntity.get(entity.id)?.size ?? 0 } : {}),
      });
    }
  }
  for (const mention of graph.mentions) {
    const source = m.index.get(mention.recordNodeId);
    const target = m.index.get(mention.entityId);
    if (source !== undefined && target !== undefined) addLink(m, { source, target, kind: 'mentions' }, seen);
  }
  for (const relation of relations) {
    const source = m.index.get(relation.subjectId);
    const target = m.index.get(relation.objectId);
    if (source !== undefined && target !== undefined) addLink(m, { source, target, kind: 'relates', label: relation.relation, ...(relation.text ? { text: relation.text } : {}) }, seen);
  }
  // A conflict is drawn between the two ends that differ, as the check drew it, when both of its relationships are shown.
  const shown = (r: ContextGraphRelation) => !filter.sourceId || r.recordNodeIds.some((id) => kept.has(id));
  for (const conflict of graph.conflicts ?? []) {
    if (!shown(conflict.first) || !shown(conflict.second)) continue;
    const [a, b] = conflictEnds(conflict);
    const source = m.index.get(a);
    const target = m.index.get(b);
    if (a !== b && source !== undefined && target !== undefined) addLink(m, { source, target, kind: 'conflicts', label: 'contradicts', ...(conflict.reason ? { text: conflict.reason } : {}) }, seen);
  }
  return m;
}

/** The two entities a conflict is drawn between: the subjects when they differ, else the objects, as the engine's check draws it. */
export function conflictEnds(conflict: ContextGraphConflict): [string, string] {
  return conflict.first.subjectId !== conflict.second.subjectId ? [conflict.first.subjectId, conflict.second.subjectId] : [conflict.first.objectId, conflict.second.objectId];
}

/** A relationship as a sentence built from the graph's entity names: "gateway 7 fails over to kandy". */
export function relationSentence(graph: Pick<ContextGraph, 'entities'>, r: ContextGraphRelation): string {
  const name = (id: string) => graph.entities.find((e) => e.id === id)?.name ?? '?';
  return `${name(r.subjectId)} ${r.relation} ${name(r.objectId)}`;
}

/** Whether two relationships are the same one: the same subject, relation and object. */
export function sameRelation(a: ContextGraphRelation, b: ContextGraphRelation): boolean {
  return a.subjectId === b.subjectId && a.relation === b.relation && a.objectId === b.objectId;
}

/** A conflict as the entity panel shows it: both relationships as sentences, the check's reason and its confidence, and its place in the graph's list so it can be selected. */
export interface EntityConflict {
  index: number;
  first: string;
  second: string;
  reason: string;
  confidence: number | null;
  /** Its line is on the canvas shown, so it can be selected there. Unset when no canvas was given. */
  drawn?: boolean;
}

/** The conflicts in which an entity takes part, on either side, as sentences built from the graph's entity names. With a model, each says whether its line is drawn. */
export function entityConflicts(graph: ContextGraph, entityId: string, m?: GraphModel): EntityConflict[] {
  return (graph.conflicts ?? [])
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => [c.first.subjectId, c.first.objectId, c.second.subjectId, c.second.objectId].includes(entityId))
    .map(({ c, index }) => ({ index, first: relationSentence(graph, c.first), second: relationSentence(graph, c.second), reason: c.reason, confidence: c.confidence, ...(m ? { drawn: conflictLink(m, c) !== undefined } : {}) }));
}

// ── Entity kinds ────────────────────────────────────────────────────────────

/** How many kinds get a colour of their own. More cannot be told apart by colour alone, so the rest share the neutral entity colour. */
export const KIND_SLOTS = 5;

/**
 * Which kinds get a colour: the `KIND_SLOTS` kinds named in the most chunks,
 * counted over the whole graph served, so a kind keeps its colour whatever the
 * filters show. Ties go to the kind with more entities, then by name. An entity
 * written without a kind, and every kind past the cap, keeps the neutral entity
 * colour.
 */
export function kindSlots(graph: Pick<ContextGraph, 'entities'>, max = KIND_SLOTS): Map<string, number> {
  const mentions = new Map<string, number>();
  const count = new Map<string, number>();
  for (const entity of graph.entities) {
    if (!entity.kind) continue;
    mentions.set(entity.kind, (mentions.get(entity.kind) ?? 0) + entity.mentions);
    count.set(entity.kind, (count.get(entity.kind) ?? 0) + 1);
  }
  const ranked = [...mentions.keys()].sort((a, b) => (mentions.get(b) ?? 0) - (mentions.get(a) ?? 0) || (count.get(b) ?? 0) - (count.get(a) ?? 0) || a.localeCompare(b));
  return new Map(ranked.slice(0, max).map((kind, slot) => [kind, slot]));
}

/** A node's own colour: an entity of a kind with a slot takes the slot's colour; every other node takes the colour of its kind of node. */
export function nodeColor(node: GraphNode, palette: GraphPalette, slots?: Map<string, number>): Rgba {
  const slot = node.entityKind !== undefined ? slots?.get(node.entityKind) : undefined;
  return slot !== undefined && palette.kinds[slot] ? palette.kinds[slot] : palette.node[node.kind];
}

/** The name as the search lists it: an entity with its kind in brackets, so two entities of one name can be told apart. */
export function searchLabel(node: GraphNode): string {
  return node.entityKind ? `${node.label} (${node.entityKind})` : node.label;
}

/** RGBA in 0..1, as the canvas takes colours. */
export type Rgba = [number, number, number, number];

/** A `#rrggbb` colour as RGBA in 0..1. */
export function hexToRgba(hex: string, alpha = 1): Rgba {
  const value = hex.replace('#', '');
  const n = Number.parseInt(value.length === 3 ? value.replace(/(.)/g, '$1$1') : value, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

export interface GraphPalette {
  node: Record<GraphNodeKind, Rgba>;
  /** One colour per kind slot (see `kindSlots`), in slot order; entities of other kinds take `node.entity`. */
  kinds: Rgba[];
  link: Record<GraphLinkKind, Rgba>;
  /** The accent: what an answer used. */
  lit: Rgba;
}

export interface CosmosBuffers {
  positions: Float32Array;
  /** The canvas's shape codes: documents are squares, everything else a circle. */
  shapes: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  links: Float32Array;
  linkColors: Float32Array;
  linkWidths: Float32Array;
  /** How hard each link pulls in the layout (see `LINK_STRENGTH`). */
  linkStrengths: Float32Array;
  /** Each point's cluster (see `clusterLayout`), or undefined for a point in none. */
  clusters: (number | undefined)[];
  /** The cluster centres, x then y for each, spread over the space. */
  clusterPositions: number[];
  /** How hard each point is pulled to its cluster's centre (see `CLUSTER_PULL`). */
  clusterStrengths: Float32Array;
}

/**
 * How hard each kind of link pulls in the layout. Relationships shape it; a
 * document line pulls less, so a document naming many entities does not fold
 * them all into one knot around it, and fewer lines cross.
 */
export const LINK_STRENGTH: Record<GraphLinkKind, number> = { relates: 1, conflicts: 0.8, mentions: 0.35 };

// The canvas's shape codes (its PointShape values), kept here so this module needs no WebGL.
const CIRCLE = 0;
const SQUARE = 1;

/** A small seeded generator, so the explore layout starts the same way for the same graph. */
function seeded(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Clusters ────────────────────────────────────────────────────────────────

/**
 * How hard a point is pulled to its cluster's centre, as a share of the
 * cluster force: a record sits at the centre; an entity named by one record
 * stays by it; one named by several stays loosely, so its lines to the other
 * records can pull it between them.
 */
export const CLUSTER_PULL = { record: 1, entity: 0.7, shared: 0.3 };

/** The canvas is about this many times wider than tall on a laptop screen; the picture is laid out to that shape. */
export const CLUSTER_ASPECT = 2.2;
/** The grid of cluster centres aims at this many columns per row, before its cells are stretched to the canvas's shape. */
const GRID_ASPECT = 1.4;
/** A cell is at most this much wider than tall, so two groups side by side never drift far apart. */
const CELL_STRETCH_MAX = 2.4;

/**
 * How many columns a grid of `count` cells gets: the shape nearest `aspect`
 * with the fewest cells left empty, so three groups make one row, four make
 * two rows of two and five make two rows of three.
 */
export function gridColumns(count: number, aspect = GRID_ASPECT): number {
  let best = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const score = Math.abs(Math.log(cols / rows / aspect)) + (1.5 * (cols * rows - count)) / count;
    if (score < bestScore) {
      best = cols;
      bestScore = score;
    }
  }
  return best;
}

export interface ClusterLayout {
  /** Each node's cluster, or undefined for a node without a group. */
  clusters: (number | undefined)[];
  /** The cluster centres, x then y for each. */
  positions: number[];
  /** Each node's pull to its centre (see `CLUSTER_PULL`); 0 without a group. */
  strengths: Float32Array;
  /** The distance between neighbouring centres. */
  step: number;
}

/**
 * The nodes' groups (see `GraphNode.group`) as clusters for the layout, with a
 * centre each on a grid spread evenly over the space, so every document gets
 * its own region and the canvas fills instead of knotting in the middle. The
 * biggest groups take alternate cells, like the black squares of a board, so
 * two big ones never sit side by side. The grid's step grows with the biggest
 * group, so neighbouring groups have room not to run into each other, and its
 * cells are wider than tall when the grid is squarer than the canvas, so the
 * picture takes the canvas's shape.
 */
export function clusterLayout(m: GraphModel, spaceSize: number, aspect = CLUSTER_ASPECT): ClusterLayout {
  const sizes = new Map<string, number>();
  for (const node of m.nodes) {
    if (node.group) sizes.set(node.group, (sizes.get(node.group) ?? 0) + 1);
  }
  const groups = [...sizes.keys()].sort((a, b) => (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0));
  const count = groups.length;
  const cols = count ? gridColumns(count) : 1;
  const rows = Math.ceil(count / cols);
  const biggest = sizes.get(groups[0] ?? '') ?? 0;
  const stretch = Math.min(CELL_STRETCH_MAX, Math.max(1, (aspect * rows) / cols));
  const step = Math.min(Math.max(120, 32 * Math.sqrt(biggest)), spaceSize / (Math.max(cols * stretch, rows) + 1));
  // The first `count` cells of the grid, the even ones first, then the odd.
  const cells = Array.from({ length: count }, (_, i) => [Math.floor(i / cols), i % cols] as const);
  const ordered = [...cells.filter(([r, c]) => (r + c) % 2 === 0), ...cells.filter(([r, c]) => (r + c) % 2 === 1)];
  const positions: number[] = new Array(count * 2).fill(0);
  const clusterOf = new Map<string, number>();
  groups.forEach((group, i) => {
    const [r, c] = ordered[i];
    clusterOf.set(group, i);
    positions[i * 2] = spaceSize / 2 + (c - (cols - 1) / 2) * step * stretch;
    positions[i * 2 + 1] = spaceSize / 2 + (r - (rows - 1) / 2) * step;
  });
  const clusters = m.nodes.map((node) => (node.group ? clusterOf.get(node.group) : undefined));
  const strengths = new Float32Array(m.nodes.length);
  m.nodes.forEach((node, i) => {
    if (!node.group) return;
    strengths[i] = node.kind === 'record' ? CLUSTER_PULL.record : (node.documents ?? 1) > 1 ? CLUSTER_PULL.shared : CLUSTER_PULL.entity;
  });
  return { clusters, positions, strengths, step };
}

export interface CosmosOptions {
  /** The kinds with a colour of their own (see `kindSlots`); without it every entity takes the neutral entity colour. */
  slots?: Map<string, number>;
  spaceSize?: number;
  seed?: number;
  /** The canvas's width over its height (see `CLUSTER_ASPECT`); the clusters are spread to that shape. */
  aspect?: number;
}

/**
 * The flat arrays the canvas draws from, in node order. A node starts in a
 * seeded spot near its cluster's centre (see `clusterLayout`), or in a square
 * around the middle of the space when it has none, so the layout begins tidy
 * and the simulation has little to untangle. An entity is coloured by its kind
 * when the kind has a slot.
 */
export function cosmosBuffers(m: GraphModel, palette: GraphPalette, { slots, spaceSize = 4096, seed = 7, aspect = CLUSTER_ASPECT }: CosmosOptions = {}): CosmosBuffers {
  const random = seeded(seed);
  const n = m.nodes.length;
  const positions = new Float32Array(n * 2);
  const colors = new Float32Array(n * 4);
  const sizes = new Float32Array(n);
  const shapes = new Float32Array(n);
  const spread = Math.min(spaceSize / 2, 200 + 40 * Math.sqrt(n));
  const layout = clusterLayout(m, spaceSize, aspect);
  m.nodes.forEach((node, i) => {
    const cluster = layout.clusters[i];
    if (cluster === undefined) {
      positions[i * 2] = spaceSize / 2 + (random() - 0.5) * spread;
      positions[i * 2 + 1] = spaceSize / 2 + (random() - 0.5) * spread;
    } else {
      // A seeded spot in a disc around the centre, a third of the way to the next centre at most.
      const angle = random() * 2 * Math.PI;
      const radius = Math.sqrt(random()) * layout.step * 0.35;
      positions[i * 2] = layout.positions[cluster * 2] + Math.cos(angle) * radius;
      positions[i * 2 + 1] = layout.positions[cluster * 2 + 1] + Math.sin(angle) * radius;
    }
    colors.set(nodeColor(node, palette, slots), i * 4);
    sizes[i] = node.size;
    shapes[i] = node.kind === 'record' ? SQUARE : CIRCLE;
  });
  const links = new Float32Array(m.links.length * 2);
  const linkColors = new Float32Array(m.links.length * 4);
  const linkWidths = new Float32Array(m.links.length);
  const linkStrengths = new Float32Array(m.links.length);
  m.links.forEach((link, i) => {
    links[i * 2] = link.source;
    links[i * 2 + 1] = link.target;
    linkColors.set(palette.link[link.kind], i * 4);
    linkWidths[i] = link.kind === 'relates' ? 1.4 : link.kind === 'conflicts' ? 2.2 : 0.6;
    linkStrengths[i] = LINK_STRENGTH[link.kind];
  });
  return { positions, colors, sizes, shapes, links, linkColors, linkWidths, linkStrengths, clusters: layout.clusters, clusterPositions: layout.positions, clusterStrengths: layout.strengths };
}

/** How strong a link in the lit neighbourhood is drawn; the rest of the canvas is greyed out around it. */
const LIT_LINK_ALPHA = 0.85;

/**
 * Link colours with the selection's links brought up to full strength, in
 * `color` when one is given. Document lines are drawn faint so they do not
 * swamp the graph, and this is how they show when their document or entity is
 * selected; an answer's facts are drawn in the accent.
 */
export function litLinkColors(m: GraphModel, palette: GraphPalette, selection: Selection, color?: Rgba): Float32Array {
  const colors = new Float32Array(m.links.length * 4);
  const lit = new Set(selection.links);
  m.links.forEach((link, i) => {
    const own = palette.link[link.kind];
    // A conflict keeps its own colour when lit, so it still reads as a conflict.
    const [r, g, b, a] = lit.has(i) && color && link.kind !== 'conflicts' ? color : own;
    colors.set([r, g, b, lit.has(i) ? Math.max(a, LIT_LINK_ALPHA) : a], i * 4);
  });
  return colors;
}

/** Point colours with the selection's points in the given colour and the rest as the palette has them. */
export function litPointColors(m: GraphModel, palette: GraphPalette, selection: Selection, color: Rgba): Float32Array {
  const colors = new Float32Array(m.nodes.length * 4);
  const lit = new Set(selection.points);
  m.nodes.forEach((node, i) => colors.set(lit.has(i) ? color : palette.node[node.kind], i * 4));
  return colors;
}

/** A label short enough to sit on the canvas; the panel shows the whole name. */
export function shortLabel(label: string, max = 26): string {
  const text = label.trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The nodes that get a label, first the ones that matter most: the selected and
 * hovered nodes, then the most-mentioned entities, then the selection's heaviest
 * neighbours. The canvas hides a label that would cover an earlier one, and the
 * caps keep a busy document, which may name hundreds of entities, from covering
 * the canvas.
 */
export function labelled(m: GraphModel, selection: Selection | null, selected: number | null, hovered: number | null, top = 12, neighbours = 14): number[] {
  const byWeight = (a: number, b: number) => (m.nodes[b].weight ?? 0) - (m.nodes[a].weight ?? 0) || a - b;
  const chosen = new Set<number>();
  if (selected !== null) chosen.add(selected);
  if (hovered !== null) chosen.add(hovered);
  const entities = m.nodes.map((_, i) => i).filter((i) => m.nodes[i].kind === 'entity');
  entities
    .sort(byWeight)
    .slice(0, top)
    .forEach((i) => chosen.add(i));
  if (selection) {
    selection.points
      .filter((i) => i !== selected)
      .sort(byWeight)
      .slice(0, neighbours)
      .forEach((i) => chosen.add(i));
  }
  return [...chosen];
}

export interface Selection {
  points: number[];
  links: number[];
}

/** A node with its direct neighbours and the links between them, as the canvas highlights them. */
export function neighbourhood(m: GraphModel, index: number): Selection {
  const points = new Set([index]);
  const links: number[] = [];
  m.links.forEach((link, i) => {
    if (link.source === index || link.target === index) {
      points.add(link.source);
      points.add(link.target);
      links.push(i);
    }
  });
  return { points: [...points], links };
}

/** Nodes whose label, or whose entity kind, holds the text, ignoring case: entities first, then records, at most `limit`. */
export function searchNodes(m: GraphModel, text: string, limit = 8): number[] {
  const wanted = text.trim().toLowerCase();
  if (!wanted) return [];
  const hits = m.nodes.map((node, i) => ({ node, i })).filter(({ node }) => node.label.toLowerCase().includes(wanted) || (node.entityKind?.toLowerCase().includes(wanted) ?? false));
  hits.sort((a, b) => Number(a.node.kind !== 'entity') - Number(b.node.kind !== 'entity') || Number(!a.node.label.toLowerCase().startsWith(wanted)) - Number(!b.node.label.toLowerCase().startsWith(wanted)) || (b.node.weight ?? 0) - (a.node.weight ?? 0));
  return hits.slice(0, limit).map(({ i }) => i);
}

// ── Answer derivation ───────────────────────────────────────────────────────

const MARKER = /\[(\s*\d{1,3}(?:\s*,\s*\d{1,3})*\s*)\]/g;
const LEADING_MARKERS = /^\s*(?:\[\s*\d{1,3}(?:\s*,\s*\d{1,3})*\s*\]\s*)+/;

/** Every passage number an answer cites, including grouped markers such as `[1, 2]`, which the engine accepts. */
export function citedPassages(answer: string | undefined): Set<number> {
  const cited = new Set<number>();
  for (const m of (answer ?? '').matchAll(MARKER)) {
    for (const part of m[1].split(',')) cited.add(Number(part.trim()));
  }
  return cited;
}

/**
 * The answer's sentences, each with the markers that cite it. A model often puts
 * a marker after the full stop ("… ten minutes. [1]"); such a piece holds no words
 * of its own, so it joins the sentence before it, as the Playground draws it.
 */
export function answerSentences(answer: string | undefined): string[] {
  const sentences: string[] = [];
  for (const piece of splitSentences(answer ?? '')) {
    // Markers at the start of a piece cite the sentence before it.
    const lead = sentences.length ? (piece.match(LEADING_MARKERS)?.[0] ?? '') : '';
    if (lead) sentences[sentences.length - 1] += lead;
    const rest = piece.slice(lead.length);
    if (rest.replace(MARKER, '').trim()) sentences.push(rest);
    else if (rest.trim() && sentences.length) sentences[sentences.length - 1] += rest;
  }
  return sentences;
}

/** The answer's sentences that cite passage `n`, without their markers, in order. */
export function sentencesCiting(answer: string | undefined, n: number): string[] {
  if (!answer) return [];
  return answerSentences(answer)
    .filter((sentence) => [...sentence.matchAll(MARKER)].some((m) => m[1].split(',').some((part) => Number(part.trim()) === n)))
    .map((sentence) =>
      sentence
        .replace(MARKER, '')
        .replace(/\s+([.,;:!?])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

export const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** Counts for the line under an answer: its sentences, the passages it cites, and the entities named by facts that stand on its passages. */
export function derivationSummary(result: Pick<ContextQueryResult, 'answer' | 'evidence' | 'facts'>): { sentences: number; passages: number; entities: number } {
  const cited = citedPassages(result.answer);
  const passages = result.answer ? result.evidence.filter((_, i) => cited.has(i + 1)).length : result.evidence.length;
  const ids = new Set(result.evidence.map((e) => e.id));
  const standing = result.facts.filter((f) => f.evidenceIds.some((id) => ids.has(id)));
  const names = new Set(standing.flatMap((f) => [f.subject.toLowerCase(), f.object.toLowerCase()]));
  const sentences = answerSentences(result.answer).length;
  return { sentences, passages, entities: names.size };
}

/** The entity names an answer's facts use, in lower case: subjects, objects, and what the graph walk went through. */
export function factEntityNames(facts: ContextFact[]): Set<string> {
  return new Set(
    facts
      .flatMap((f) => [f.subject, f.object, f.linkedThrough ?? ''])
      .filter(Boolean)
      .map((n) => n.toLowerCase()),
  );
}

/**
 * The id the engine gave the entity with this name, ignoring case. An entity is its
 * name and its kind, so with a kind it is the entity of that kind; without one, or
 * when no entity of the name has it, the first of the name. Undefined when the
 * graph shown does not hold it.
 */
export function entityId(graph: ContextGraph, name: string, kind?: string): string | undefined {
  const wanted = name.toLowerCase();
  const named = graph.entities.filter((e) => e.name.toLowerCase() === wanted);
  return (kind ? named.find((e) => e.kind === kind) : undefined)?.id ?? named[0]?.id;
}

/** The explore model's index of the entity with this name and kind (see `entityId`), or undefined when the graph shown does not hold it. */
export function entityIndex(m: GraphModel, graph: ContextGraph, name: string, kind?: string): number | undefined {
  const id = entityId(graph, name, kind);
  return id === undefined ? undefined : m.index.get(id);
}

/** A short text drawn at the middle of a link: the relationship it stands for. `detail` is the whole sentence, shown on hover. */
export interface LinkTag {
  link: number;
  text: string;
  detail?: string;
  /** Drawn in the conflict colour: the tag of a conflict line. */
  tone?: 'conflict';
  /** Part of what is selected: drawn stronger. */
  lit?: boolean;
}

/** One link's tag: its label, the sentence behind it, the conflict tone on a conflict line, and `lit` when it is part of the selection. */
export function linkTag(m: GraphModel, link: number, lit = false): LinkTag {
  const l = m.links[link];
  return { link, text: l.label ?? '', ...(l.text ? { detail: l.text } : {}), ...(l.kind === 'conflicts' ? { tone: 'conflict' as const } : {}), ...(lit ? { lit } : {}) };
}

/** The relationship text for each lit relationship link, so a selected node's relationships read off the canvas. Document lines have no text. */
export function relationTags(m: GraphModel, selection: Selection): LinkTag[] {
  return selection.links.filter((i) => (m.links[i].kind === 'relates' || m.links[i].kind === 'conflicts') && !!m.links[i].label).map((i) => linkTag(m, i));
}

// ── Links as selections ─────────────────────────────────────────────────────

const LINK_KEY_PREFIX = 'link:';
/** Joins the parts of a link key; no engine id holds it. */
const LINK_KEY_JOIN = '\u001f';

/**
 * The key the Graph tab keeps for a selected relationship or conflict, so it
 * can sit in the URL like a node's: the link's kind, the keys of its two ends
 * and its label. A document line has no label to click, so it has no key.
 */
export function linkKey(m: GraphModel, link: number): string | undefined {
  const l = m.links[link];
  if (!l || l.kind === 'mentions') return undefined;
  return LINK_KEY_PREFIX + [l.kind, m.nodes[l.source].key, m.nodes[l.target].key, l.label ?? ''].join(LINK_KEY_JOIN);
}

/** The link a key names, when the model draws it; undefined for a node's key or a link not drawn. */
export function linkIndex(m: GraphModel, key: string): number | undefined {
  if (!key.startsWith(LINK_KEY_PREFIX)) return undefined;
  const [kind, source, target, label = ''] = key.slice(LINK_KEY_PREFIX.length).split(LINK_KEY_JOIN);
  const s = m.index.get(source);
  const t = m.index.get(target);
  if (s === undefined || t === undefined || kind === 'mentions') return undefined;
  const at = m.links.findIndex((l) => l.kind === kind && l.source === s && l.target === t && (l.label ?? '') === label);
  return at < 0 ? undefined : at;
}

/** The relationship a `relates` link stands for, from the graph served; undefined for any other link. */
export function relationOf(m: GraphModel, graph: ContextGraph, link: number): ContextGraphRelation | undefined {
  const l = m.links[link];
  if (!l || l.kind !== 'relates') return undefined;
  const subjectId = m.nodes[l.source].key;
  const objectId = m.nodes[l.target].key;
  return graph.relations.find((r) => r.subjectId === subjectId && r.objectId === objectId && r.relation === l.label);
}

/** The `relates` link drawn for a relationship, or undefined when an end of it is not drawn. */
export function relationLink(m: GraphModel, relation: ContextGraphRelation): number | undefined {
  const s = m.index.get(relation.subjectId);
  const t = m.index.get(relation.objectId);
  if (s === undefined || t === undefined) return undefined;
  const at = m.links.findIndex((l) => l.kind === 'relates' && l.source === s && l.target === t && l.label === relation.relation);
  return at < 0 ? undefined : at;
}

/** The conflict line drawn for a conflict, between the two ends that differ, or undefined when it is not drawn. */
export function conflictLink(m: GraphModel, conflict: ContextGraphConflict): number | undefined {
  const [a, b] = conflictEnds(conflict);
  const s = m.index.get(a);
  const t = m.index.get(b);
  if (s === undefined || t === undefined) return undefined;
  const at = m.links.findIndex((l) => l.kind === 'conflicts' && ((l.source === s && l.target === t) || (l.source === t && l.target === s)));
  return at < 0 ? undefined : at;
}

/** The conflicts a conflict line stands for, each with its place in the graph's list: two conflicts between the same two ends share one line. */
export function conflictsOn(m: GraphModel, graph: ContextGraph, link: number): { index: number; conflict: ContextGraphConflict }[] {
  const l = m.links[link];
  if (!l || l.kind !== 'conflicts') return [];
  return (graph.conflicts ?? []).map((conflict, index) => ({ index, conflict })).filter(({ conflict }) => conflictLink(m, conflict) === link);
}

/** A link as a selection: what lights up, and the labels shown, when its label is clicked. */
export interface LinkSelection extends Selection {
  tags: LinkTag[];
}

/**
 * What a click on a link's label selects. For a relationship: its two ends and
 * the link, with its label. For a conflict line: every entity on both sides of
 * each conflict drawn there, the links of the two relationships that disagree
 * and the line itself, each with its label, so the whole disagreement reads
 * off the canvas.
 */
export function linkSelection(m: GraphModel, graph: ContextGraph, link: number): LinkSelection {
  const l = m.links[link];
  const points = new Set<number>([l.source, l.target]);
  const links = new Set<number>([link]);
  if (l.kind === 'conflicts') {
    for (const { conflict } of conflictsOn(m, graph, link)) {
      for (const relation of [conflict.first, conflict.second]) {
        for (const id of [relation.subjectId, relation.objectId]) {
          const at = m.index.get(id);
          if (at !== undefined) points.add(at);
        }
        const drawn = relationLink(m, relation);
        if (drawn !== undefined) links.add(drawn);
      }
    }
  }
  const chosen = [...links];
  return { points: [...points], links: chosen, tags: chosen.filter((i) => !!m.links[i].label).map((i) => linkTag(m, i, true)) };
}

/** Narrows the facts lit: those naming one entity, or those standing on one passage. */
export interface FactFocus {
  entity?: string;
  /** The entity's kind, when known, so a name that is more than one entity narrows to the right one. */
  entityKind?: string;
  evidenceId?: string;
}

export interface FactSelection extends Selection {
  tags: LinkTag[];
  /** Entities the facts name that the graph shown does not hold, so they cannot be drawn. */
  missing: string[];
}

/**
 * The conflict line an answer's conflict stands on: between the two ends that
 * differ, as the check drew it. Undefined when the graph shown does not hold
 * both of those entities, or draws no line between them.
 */
export function queryConflictLink(m: GraphModel, graph: ContextGraph, conflict: ContextQueryConflict): number | undefined {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const subjectsDiffer = !same(conflict.first.subject, conflict.second.subject) || conflict.first.subjectKind !== conflict.second.subjectKind;
  const ends: [string, string | undefined][] = subjectsDiffer
    ? [
        [conflict.first.subject, conflict.first.subjectKind],
        [conflict.second.subject, conflict.second.subjectKind],
      ]
    : [
        [conflict.first.object, conflict.first.objectKind],
        [conflict.second.object, conflict.second.objectKind],
      ];
  const [a, b] = ends.map(([name, kind]) => entityIndex(m, graph, name, kind));
  if (a === undefined || b === undefined || a === b) return undefined;
  const at = m.links.findIndex((link) => link.kind === 'conflicts' && ((link.source === a && link.target === b) || (link.source === b && link.target === a)));
  return at < 0 ? undefined : at;
}

/**
 * The part of the graph an answer's facts used: the entities they name and the
 * relationships between them, with the relationship text for each lit link. A
 * fact's link is the `relates` link between its two entities with the same
 * text, or any between them. Without a focus, the entities the graph walk went
 * through are lit too.
 */
export function factSelection(m: GraphModel, graph: ContextGraph, facts: ContextFact[], focus: FactFocus = {}, conflicts: ContextQueryConflict[] = []): FactSelection {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  // A fact end is the focused entity when the names match and, when both sides know a kind, the kinds match too.
  const focused = (name: string, kind: string | undefined) => !!focus.entity && same(name, focus.entity) && (!kind || !focus.entityKind || kind === focus.entityKind);
  const inFocus = (f: ContextFact) => (!focus.entity || focused(f.subject, f.subjectKind) || focused(f.object, f.objectKind)) && (!focus.evidenceId || f.evidenceIds.includes(focus.evidenceId));
  // Both sides of a conflict are facts of the answer too: their entities and relationships light up like the rest.
  const chosen = [...facts, ...conflicts.flatMap((c) => [c.first, c.second])].filter(inFocus);
  const points = new Set<number>();
  const links = new Set<number>();
  const tags: LinkTag[] = [];
  const missing = new Set<string>();
  const relates = m.links.map((link, i) => ({ link, i })).filter(({ link }) => link.kind === 'relates');
  if (focus.entity) {
    const self = entityIndex(m, graph, focus.entity, focus.entityKind);
    if (self !== undefined) points.add(self);
  }
  for (const fact of chosen) {
    const named: [string, string | undefined][] = [
      [fact.subject, fact.subjectKind],
      [fact.object, fact.objectKind],
    ];
    const ends = named.map(([name, kind]) => ({ name, index: entityIndex(m, graph, name, kind) }));
    for (const end of ends) {
      if (end.index === undefined) missing.add(end.name);
      else points.add(end.index);
    }
    const [subject, object] = ends.map((end) => end.index);
    if (subject === undefined || object === undefined) continue;
    const between = relates.filter(({ link }) => (link.source === subject && link.target === object) || (link.source === object && link.target === subject));
    const match = between.find(({ link }) => same(link.label ?? '', fact.relation)) ?? between[0];
    if (match && !links.has(match.i)) {
      links.add(match.i);
      tags.push({ link: match.i, text: fact.relation, ...(fact.text ? { detail: fact.text } : {}) });
    }
  }
  // A conflict's own line, between the two ends that differ, lights up when both of its sides are in the part shown.
  for (const conflict of conflicts) {
    if (!inFocus(conflict.first) || !inFocus(conflict.second)) continue;
    const match = queryConflictLink(m, graph, conflict);
    if (match !== undefined && !links.has(match)) {
      links.add(match);
      tags.push({ link: match, text: 'contradicts', ...(conflict.reason ? { detail: conflict.reason } : {}), tone: 'conflict' });
    }
  }
  if (!focus.entity && !focus.evidenceId) {
    for (const through of facts.map((f) => f.linkedThrough).filter((n): n is string => !!n)) {
      const index = entityIndex(m, graph, through);
      if (index !== undefined) points.add(index);
    }
  }
  return { points: [...points], links: [...links], tags, missing: [...missing] };
}
