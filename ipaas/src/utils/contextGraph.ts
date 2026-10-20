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
import type { ContextFact, ContextGraph, ContextGraphRecord, ContextQueryResult } from '../types/contextEngine';

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
}

export type GraphLinkKind = 'mentions' | 'relates';

export interface GraphLink {
  source: number;
  target: number;
  kind: GraphLinkKind;
  /** The relationship, for `relates` links: the short label drawn on the link. */
  label?: string;
  /** The relationship as one sentence, when the engine has one; it keeps what the label can lose, such as a "not". */
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
  const byEntity = new Map<string, Set<string>>();
  for (const mention of graph.mentions) {
    if (!kept.has(mention.recordNodeId)) continue;
    const records = byEntity.get(mention.entityId) ?? new Set<string>();
    records.add(mention.recordNodeId);
    byEntity.set(mention.entityId, records);
  }
  const relations = graph.relations.filter((r) => !filter.sourceId || r.recordNodeIds.some((id) => kept.has(id)));
  const named = new Set([...byEntity.keys(), ...relations.flatMap((r) => [r.subjectId, r.objectId])]);
  const degree = new Map<string, number>();
  for (const relation of relations) {
    degree.set(relation.subjectId, (degree.get(relation.subjectId) ?? 0) + 1);
    degree.set(relation.objectId, (degree.get(relation.objectId) ?? 0) + 1);
  }
  if (filter.records) {
    for (const record of graph.records) {
      if (kept.has(record.id)) addNode(m, { key: record.id, kind: 'record', label: recordLabel(record), size: RECORD_SIZE });
    }
  }
  if (filter.entities) {
    for (const entity of graph.entities) {
      if (filter.sourceId && !named.has(entity.id)) continue;
      if (filter.detail === 'key' && !isKeyEntity(entity.mentions, degree.get(entity.id) ?? 0) && !filter.keepNames?.has(entity.name.toLowerCase())) continue;
      addNode(m, { key: entity.id, kind: 'entity', label: entity.name, size: entitySize(entity.mentions), weight: entity.mentions });
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
  return m;
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
}

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

/**
 * The flat arrays the canvas draws from, in node order. Nodes start in a seeded
 * square around the centre of the simulation space and the simulation moves
 * them.
 */
export function cosmosBuffers(m: GraphModel, palette: GraphPalette, spaceSize = 4096, seed = 7): CosmosBuffers {
  const random = seeded(seed);
  const n = m.nodes.length;
  const positions = new Float32Array(n * 2);
  const colors = new Float32Array(n * 4);
  const sizes = new Float32Array(n);
  const shapes = new Float32Array(n);
  const spread = Math.min(spaceSize / 2, 200 + 40 * Math.sqrt(n));
  m.nodes.forEach((node, i) => {
    positions[i * 2] = spaceSize / 2 + (random() - 0.5) * spread;
    positions[i * 2 + 1] = spaceSize / 2 + (random() - 0.5) * spread;
    colors.set(palette.node[node.kind], i * 4);
    sizes[i] = node.size;
    shapes[i] = node.kind === 'record' ? SQUARE : CIRCLE;
  });
  const links = new Float32Array(m.links.length * 2);
  const linkColors = new Float32Array(m.links.length * 4);
  const linkWidths = new Float32Array(m.links.length);
  m.links.forEach((link, i) => {
    links[i * 2] = link.source;
    links[i * 2 + 1] = link.target;
    linkColors.set(palette.link[link.kind], i * 4);
    linkWidths[i] = link.kind === 'relates' ? 1.4 : 0.6;
  });
  return { positions, colors, sizes, shapes, links, linkColors, linkWidths };
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
    const [r, g, b, a] = lit.has(i) && color ? color : own;
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

/** Nodes whose label holds the text, ignoring case: entities first, then records, at most `limit`. */
export function searchNodes(m: GraphModel, text: string, limit = 8): number[] {
  const wanted = text.trim().toLowerCase();
  if (!wanted) return [];
  const hits = m.nodes.map((node, i) => ({ node, i })).filter(({ node }) => node.label.toLowerCase().includes(wanted));
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

/** The id the engine gave the entity with this name, ignoring case, or undefined when the graph shown does not hold it. */
export function entityId(graph: ContextGraph, name: string): string | undefined {
  const wanted = name.toLowerCase();
  return graph.entities.find((e) => e.name.toLowerCase() === wanted)?.id;
}

/** The explore model's index of the entity with this name, ignoring case, or undefined when the graph shown does not hold it. */
export function entityIndex(m: GraphModel, graph: ContextGraph, name: string): number | undefined {
  const id = entityId(graph, name);
  return id === undefined ? undefined : m.index.get(id);
}

/** A short text drawn at the middle of a link: the relationship it stands for. `detail` is the whole sentence, shown on hover. */
export interface LinkTag {
  link: number;
  text: string;
  detail?: string;
}

/** The relationship text for each lit relationship link, so a selected node's relationships read off the canvas. Document lines have no text. */
export function relationTags(m: GraphModel, selection: Selection): LinkTag[] {
  return selection.links.filter((i) => m.links[i].kind === 'relates' && !!m.links[i].label).map((i) => ({ link: i, text: m.links[i].label as string, ...(m.links[i].text ? { detail: m.links[i].text } : {}) }));
}

/** Narrows the facts lit: those naming one entity, or those standing on one passage. */
export interface FactFocus {
  entity?: string;
  evidenceId?: string;
}

export interface FactSelection extends Selection {
  tags: LinkTag[];
  /** Entities the facts name that the graph shown does not hold, so they cannot be drawn. */
  missing: string[];
}

/**
 * The part of the graph an answer's facts used: the entities they name and the
 * relationships between them, with the relationship text for each lit link. A
 * fact's link is the `relates` link between its two entities with the same
 * text, or any between them. Without a focus, the entities the graph walk went
 * through are lit too.
 */
export function factSelection(m: GraphModel, graph: ContextGraph, facts: ContextFact[], focus: FactFocus = {}): FactSelection {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const chosen = facts.filter((f) => (!focus.entity || same(f.subject, focus.entity) || same(f.object, focus.entity)) && (!focus.evidenceId || f.evidenceIds.includes(focus.evidenceId)));
  const points = new Set<number>();
  const links = new Set<number>();
  const tags: LinkTag[] = [];
  const missing = new Set<string>();
  const relates = m.links.map((link, i) => ({ link, i })).filter(({ link }) => link.kind === 'relates');
  if (focus.entity) {
    const self = entityIndex(m, graph, focus.entity);
    if (self !== undefined) points.add(self);
  }
  for (const fact of chosen) {
    const ends = [fact.subject, fact.object].map((name) => ({ name, index: entityIndex(m, graph, name) }));
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
  if (!focus.entity && !focus.evidenceId) {
    for (const through of facts.map((f) => f.linkedThrough).filter((n): n is string => !!n)) {
      const index = entityIndex(m, graph, through);
      if (index !== undefined) points.add(index);
    }
  }
  return { points: [...points], links: [...links], tags, missing: [...missing] };
}
