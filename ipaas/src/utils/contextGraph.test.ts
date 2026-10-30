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

import { describe, expect, it } from 'vitest';
import {
  answerSentences,
  citedPassages,
  CLUSTER_PULL,
  clusterLayout,
  conflictEnds,
  conflictLink,
  conflictsOn,
  cosmosBuffers,
  derivationSummary,
  entityConflicts,
  entityId,
  entityIndex,
  entitySize,
  exploreModel,
  factEntityNames,
  factSelection,
  gridColumns,
  hexToRgba,
  isKeyEntity,
  kindSlots,
  labelled,
  LINK_STRENGTH,
  linkIndex,
  linkKey,
  linkSelection,
  litLinkColors,
  litPointColors,
  neighbourhood,
  nodeColor,
  relationLink,
  relationOf,
  relationSentence,
  relationTags,
  ordinal,
  queryConflictLink,
  sameRelation,
  searchLabel,
  searchNodes,
  sentencesCiting,
  shortLabel,
  type GraphPalette,
} from './contextGraph';
import type { ContextEvidence, ContextGraph } from '../types/contextEngine';

const GRAPH: ContextGraph = {
  entities: [
    { id: 'ent_g', name: 'gateway 7', kind: 'system', mentions: 3 },
    { id: 'ent_k', name: 'kandy', mentions: 1 },
    { id: 'ent_v', name: 'vault', mentions: 1 },
  ],
  records: [
    { id: 'rec_pay', sourceId: 'src_a', recordId: 'pay.txt' },
    { id: 'rec_fail', sourceId: 'src_a', recordId: 'failover.txt' },
    { id: 'rec_ops', sourceId: 'src_b', recordId: 'ops.md' },
  ],
  mentions: [
    { entityId: 'ent_g', recordNodeId: 'rec_pay', chunks: 1 },
    { entityId: 'ent_g', recordNodeId: 'rec_fail', chunks: 2 },
    { entityId: 'ent_k', recordNodeId: 'rec_fail', chunks: 1 },
    { entityId: 'ent_v', recordNodeId: 'rec_ops', chunks: 1 },
  ],
  relations: [
    { subjectId: 'ent_g', relation: 'fails over to', objectId: 'ent_k', recordNodeIds: ['rec_fail'], text: 'Gateway 7 fails over to Kandy when it is down.' },
    { subjectId: 'ent_g', relation: 'stores keys in', objectId: 'ent_v', recordNodeIds: ['rec_ops'] },
  ],
  conflicts: [],
  truncated: false,
};

const PALETTE: GraphPalette = {
  node: { record: hexToRgba('#1d2028'), entity: hexToRgba('#8a92a6') },
  kinds: [hexToRgba('#2a78d6'), hexToRgba('#1baf7a')],
  link: { mentions: hexToRgba('#d4d7df'), relates: hexToRgba('#9aa1b1'), conflicts: hexToRgba('#d32f2f') },
  lit: hexToRgba('#f26b1d'),
};

/** Colours come back as 32-bit floats, so they are compared loosely. */
const near = (got: ArrayLike<number>, want: number[]) => Array.from(got).forEach((v, i) => expect(v).toBeCloseTo(want[i], 5));

const evidence = (id: string, recordId: string): ContextEvidence => ({ id, recordId, sourceId: 'src_a', sourceVersion: '1', passage: `${recordId} text` });

describe('exploreModel', () => {
  it('puts records before entities and links mentions and relationships between drawn nodes', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    expect(m.nodes.map((n) => n.kind)).toEqual(['record', 'record', 'record', 'entity', 'entity', 'entity']);
    expect(m.links.filter((l) => l.kind === 'mentions')).toHaveLength(4);
    const relates = m.links.filter((l) => l.kind === 'relates').map((l) => [m.nodes[l.source].label, l.label, m.nodes[l.target].label]);
    expect(relates).toEqual([
      ['gateway 7', 'fails over to', 'kandy'],
      ['gateway 7', 'stores keys in', 'vault'],
    ]);
    expect(m.nodes[m.index.get('ent_g') as number].size).toBe(entitySize(3));
  });

  it('keeps one source’s records and only what they name', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all', sourceId: 'src_a' });
    expect(m.nodes.map((n) => n.label).sort()).toEqual(['failover.txt', 'gateway 7', 'kandy', 'pay.txt']);
    expect(m.links.map((l) => l.label).filter(Boolean)).toEqual(['fails over to']);
  });

  it('draws no link to a kind that is hidden', () => {
    const m = exploreModel(GRAPH, { records: false, entities: true, detail: 'all' });
    expect(m.nodes.every((n) => n.kind === 'entity')).toBe(true);
    expect(m.links.every((l) => l.kind === 'relates')).toBe(true);
  });
});

describe('key entities', () => {
  it('keeps an entity named more than once or in several relationships', () => {
    expect(isKeyEntity(2, 0)).toBe(true);
    expect(isKeyEntity(1, 3)).toBe(true);
    expect(isKeyEntity(1, 2)).toBe(false);
  });

  it('draws only key entities and the links between drawn nodes', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'key' });
    expect(m.nodes.filter((n) => n.kind === 'entity').map((n) => n.label)).toEqual(['gateway 7']);
    expect(m.links.filter((l) => l.kind === 'relates')).toHaveLength(0);
    expect(m.links.filter((l) => l.kind === 'mentions')).toHaveLength(2);
  });
});

describe('document groups', () => {
  it('sits each record with itself and each entity with the record naming it most', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const node = (key: string) => m.nodes[m.index.get(key) as number];
    expect(node('rec_pay').group).toBe('rec_pay');
    // gateway 7 is named in one chunk of pay.txt and two of failover.txt.
    expect(node('ent_g')).toMatchObject({ group: 'rec_fail', documents: 2 });
    expect(node('ent_k')).toMatchObject({ group: 'rec_fail', documents: 1 });
    expect(node('ent_v')).toMatchObject({ group: 'rec_ops', documents: 1 });
  });

  it('keeps the groups when documents are hidden, and gives none to an entity no record shown names', () => {
    const hidden = exploreModel(GRAPH, { records: false, entities: true, detail: 'all' });
    expect(hidden.nodes.map((n) => n.group)).toEqual(['rec_fail', 'rec_fail', 'rec_ops']);
    const loose: ContextGraph = {
      ...GRAPH,
      entities: [...GRAPH.entities, { id: 'ent_x', name: 'x', mentions: 0 }],
      relations: [...GRAPH.relations, { subjectId: 'ent_x', relation: 'runs', objectId: 'ent_v', recordNodeIds: [] }],
    };
    const m = exploreModel(loose, { records: true, entities: true, detail: 'all' });
    const x = m.index.get('ent_x') as number;
    expect(m.nodes[x].group).toBeUndefined();
    const b = cosmosBuffers(m, PALETTE);
    expect(b.clusters[x]).toBeUndefined();
    expect(b.clusterStrengths[x]).toBe(0);
  });

  it('picks a grid near the canvas shape with the fewest empty cells', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map((n) => gridColumns(n))).toEqual([1, 2, 3, 2, 3, 3, 4]);
  });

  it('spreads the clusters over a grid, the biggest on alternate cells, and pulls a shared entity loosely', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const layout = clusterLayout(m, 4096);
    const cluster = (key: string) => layout.clusters[m.index.get(key) as number] as number;
    const centre = (key: string) => [layout.positions[cluster(key) * 2], layout.positions[cluster(key) * 2 + 1]];
    // Three documents make one row of three: failover.txt (three nodes) and ops.md (two) at the ends, pay.txt between.
    expect(layout.positions).toHaveLength(6);
    expect(centre('rec_fail')).toEqual([2048 - layout.step, 2048]);
    expect(centre('rec_ops')).toEqual([2048 + layout.step, 2048]);
    expect(centre('rec_pay')).toEqual([2048, 2048]);
    expect(cluster('ent_g')).toBe(cluster('rec_fail'));
    expect(cluster('ent_k')).toBe(cluster('rec_fail'));
    expect(cluster('ent_v')).toBe(cluster('rec_ops'));
    const strength = (key: string) => layout.strengths[m.index.get(key) as number];
    expect(strength('rec_fail')).toBe(CLUSTER_PULL.record);
    expect(strength('ent_k')).toBeCloseTo(CLUSTER_PULL.entity, 5);
    expect(strength('ent_g')).toBeCloseTo(CLUSTER_PULL.shared, 5);
  });

  it('stretches a square grid to the canvas shape and puts the biggest groups on a diagonal', () => {
    const four: ContextGraph = { ...GRAPH, records: [0, 1, 2, 3].map((i) => ({ id: `rec_${i}`, sourceId: 'src_a', recordId: `${i}.txt` })), mentions: [], relations: [], entities: [] };
    const m = exploreModel(four, { records: true, entities: true, detail: 'all' });
    const layout = clusterLayout(m, 4096, 2.2);
    const at = (i: number) => [layout.positions[(layout.clusters[i] as number) * 2], layout.positions[(layout.clusters[i] as number) * 2 + 1]];
    // Two rows of two; the cells are 2.2 times wider than tall, the canvas's shape.
    const xs = new Set(m.nodes.map((_, i) => at(i)[0]));
    const ys = new Set(m.nodes.map((_, i) => at(i)[1]));
    expect([...xs].sort((a, b) => a - b)).toEqual([2048 - 1.1 * layout.step, 2048 + 1.1 * layout.step]);
    expect([...ys].sort((a, b) => a - b)).toEqual([2048 - 0.5 * layout.step, 2048 + 0.5 * layout.step]);
    // The first two groups (equal in size, so in record order) sit corner to corner.
    expect(at(0)[0]).not.toBe(at(1)[0]);
    expect(at(0)[1]).not.toBe(at(1)[1]);
  });

  it('starts each node near its cluster centre and hands the clusters to the canvas', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const layout = clusterLayout(m, 4096);
    const b = cosmosBuffers(m, PALETTE);
    expect(b.clusters).toEqual(layout.clusters);
    expect(b.clusterPositions).toEqual(layout.positions);
    expect(Array.from(b.clusterStrengths)).toEqual(Array.from(layout.strengths));
    m.nodes.forEach((_, i) => {
      const c = layout.clusters[i] as number;
      const away = Math.hypot(b.positions[i * 2] - layout.positions[c * 2], b.positions[i * 2 + 1] - layout.positions[c * 2 + 1]);
      expect(away).toBeLessThanOrEqual(layout.step * 0.35 + 1e-3);
    });
  });
});

describe('labels', () => {
  it('shortens a long name and leaves a short one alone', () => {
    expect(shortLabel('neo4j')).toBe('neo4j');
    expect(shortLabel('neo4j production architecture (create context graph)', 20)).toBe('neo4j production ar…');
  });

  it('labels the selected and hovered nodes first, then the top entities, then the heaviest neighbours', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const gateway = m.index.get('ent_g') as number;
    const failover = m.index.get('rec_fail') as number;
    expect(labelled(m, null, null, null, 1)).toEqual([gateway]);
    const withSelection = labelled(m, neighbourhood(m, failover), failover, m.index.get('rec_ops') as number, 1, 1);
    expect(withSelection).toEqual([failover, m.index.get('rec_ops'), gateway]);
    expect(labelled(m, neighbourhood(m, failover), failover, null, 0, 5)).toEqual([failover, gateway, m.index.get('ent_k')]);
  });
});

describe('cosmosBuffers', () => {
  it('lays out flat arrays in node and link order', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const b = cosmosBuffers(m, PALETTE);
    expect(b.positions).toHaveLength(m.nodes.length * 2);
    expect(b.colors).toHaveLength(m.nodes.length * 4);
    near(b.colors.slice(0, 4), PALETTE.node.record);
    expect(Array.from(b.links)).toEqual(m.links.flatMap((l) => [l.source, l.target]));
    near(
      b.linkWidths,
      m.links.map((l) => (l.kind === 'relates' ? 1.4 : 0.6)),
    );
    near(
      b.linkStrengths,
      m.links.map((l) => LINK_STRENGTH[l.kind]),
    );
    expect(Array.from(cosmosBuffers(exploreModel(GRAPH, { records: true, entities: true, detail: 'all' }), PALETTE).shapes.slice(0, 4))).toEqual([1, 1, 1, 0]);
  });

  it('draws nothing for an empty graph, such as one whose records were all deleted', () => {
    const empty: ContextGraph = { entities: [], records: [], mentions: [], relations: [], conflicts: [], truncated: false };
    const m = exploreModel(empty, { records: true, entities: true, detail: 'all' });
    const b = cosmosBuffers(m, PALETTE, { slots: kindSlots(empty) });
    expect(m.nodes).toHaveLength(0);
    expect(b.positions).toHaveLength(0);
    expect(b.links).toHaveLength(0);
    expect(b.clusterPositions).toHaveLength(0);
    expect(labelled(m, null, null, null)).toEqual([]);
  });

  it('starts an unplaced graph the same way every time', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    expect(Array.from(cosmosBuffers(m, PALETTE).positions)).toEqual(Array.from(cosmosBuffers(m, PALETTE).positions));
  });

  it('colours an entity by its kind’s slot and everything else by its kind of node', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const b = cosmosBuffers(m, PALETTE, { slots: kindSlots(GRAPH) });
    const colorOf = (key: string) => b.colors.slice((m.index.get(key) as number) * 4, (m.index.get(key) as number) * 4 + 4);
    near(colorOf('ent_g'), PALETTE.kinds[0]); // a system: the only kind, so the first slot
    near(colorOf('ent_k'), PALETTE.node.entity); // written without a kind
    near(colorOf('rec_pay'), PALETTE.node.record);
    // Without slots every entity is neutral, as the derivation view draws it.
    near(cosmosBuffers(m, PALETTE).colors.slice((m.index.get('ent_g') as number) * 4, (m.index.get('ent_g') as number) * 4 + 4), PALETTE.node.entity);
  });
});

describe('entity kinds', () => {
  const entities = [
    { id: 'a', name: 'a', kind: 'place', mentions: 1 },
    { id: 'b', name: 'b', kind: 'place', mentions: 1 },
    { id: 'c', name: 'c', kind: 'person', mentions: 5 },
    { id: 'd', name: 'd', kind: 'building', mentions: 2 },
    { id: 'e', name: 'e', kind: 'animal', mentions: 2 },
    { id: 'f', name: 'f', mentions: 9 },
  ];

  it('gives a slot to the kinds named most, ties to the kind with more entities, then by name, up to the cap', () => {
    expect([...kindSlots({ entities })]).toEqual([
      ['person', 0],
      ['place', 1],
      ['animal', 2],
      ['building', 3],
    ]);
    expect([...kindSlots({ entities }, 2).keys()]).toEqual(['person', 'place']);
    expect(kindSlots({ entities: [{ id: 'f', name: 'f', mentions: 9 }] }).size).toBe(0);
  });

  it('colours a kind with a slot and leaves a kind past the palette, or no kind, neutral', () => {
    const slots = kindSlots({ entities });
    const node = (entityKind?: string) => ({ key: 'x', kind: 'entity' as const, label: 'x', size: 4, ...(entityKind ? { entityKind } : {}) });
    expect(nodeColor(node('person'), PALETTE, slots)).toEqual(PALETTE.kinds[0]);
    expect(nodeColor(node('place'), PALETTE, slots)).toEqual(PALETTE.kinds[1]);
    // The test palette has two colours, so the third slot has none to take.
    expect(nodeColor(node('animal'), PALETTE, slots)).toEqual(PALETTE.node.entity);
    expect(nodeColor(node(), PALETTE, slots)).toEqual(PALETTE.node.entity);
    expect(nodeColor({ key: 'r', kind: 'record', label: 'r', size: 9 }, PALETTE, slots)).toEqual(PALETTE.node.record);
  });

  it('lists an entity with its kind in brackets and finds it by its kind too', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    expect(searchLabel(m.nodes[m.index.get('ent_g') as number])).toBe('gateway 7 (system)');
    expect(searchLabel(m.nodes[m.index.get('ent_k') as number])).toBe('kandy');
    expect(searchLabel(m.nodes[m.index.get('rec_pay') as number])).toBe('pay.txt');
    expect(searchNodes(m, 'system').map((i) => m.nodes[i].label)).toEqual(['gateway 7']);
  });
});

describe('selection', () => {
  it('draws the selection’s links at full strength and leaves the rest faint', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const faint: GraphPalette = { ...PALETTE, link: { ...PALETTE.link, mentions: hexToRgba('#d4d7df', 0.2) } };
    const colors = litLinkColors(m, faint, neighbourhood(m, m.index.get('rec_pay') as number));
    const alphaOf = (i: number) => colors[i * 4 + 3];
    const payLink = m.links.findIndex((l) => l.source === m.index.get('rec_pay'));
    const otherLink = m.links.findIndex((l) => l.kind === 'mentions' && l.source !== m.index.get('rec_pay'));
    expect(alphaOf(payLink)).toBeCloseTo(0.85);
    expect(alphaOf(otherLink)).toBeCloseTo(0.2);
  });

  it('lights a node with its direct neighbours and the links between them', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const k = m.index.get('ent_k') as number;
    const s = neighbourhood(m, k);
    expect(s.points.map((i) => m.nodes[i].label).sort()).toEqual(['failover.txt', 'gateway 7', 'kandy']);
    expect(s.links).toHaveLength(2);
  });

  it('writes the relationship on each lit relationship link, with the sentence behind it, and nothing on document lines', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const gateway = neighbourhood(m, m.index.get('ent_g') as number);
    const tags = relationTags(m, gateway).sort((a, b) => a.text.localeCompare(b.text));
    expect(tags.map((t) => t.text)).toEqual(['fails over to', 'stores keys in']);
    expect(tags[0].detail).toBe('Gateway 7 fails over to Kandy when it is down.');
    expect(tags[1].detail).toBeUndefined();
    expect(relationTags(m, neighbourhood(m, m.index.get('rec_pay') as number))).toEqual([]);
  });

  it('finds entities before records, prefix matches first', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    expect(searchNodes(m, 'a').map((i) => m.nodes[i].label)).toEqual(['gateway 7', 'kandy', 'vault', 'pay.txt', 'failover.txt']);
    expect(searchNodes(m, '  ')).toEqual([]);
  });
});

describe('links as selections', () => {
  const second = { subjectId: 'ent_g', relation: 'fails over to', objectId: 'ent_v', recordNodeIds: ['rec_ops'] };
  const withConflict: ContextGraph = {
    ...GRAPH,
    relations: [...GRAPH.relations, second],
    conflicts: [{ first: GRAPH.relations[0], second, reason: 'Two different failover targets.', confidence: 0.9 }],
  };

  it('gives a relationship and a conflict a key that finds the link again, and a document line none', () => {
    const m = exploreModel(withConflict, { records: true, entities: true, detail: 'all' });
    const relates = m.links.findIndex((l) => l.kind === 'relates');
    const key = linkKey(m, relates) as string;
    expect(key.startsWith('link:')).toBe(true);
    expect(linkIndex(m, key)).toBe(relates);
    const conflict = m.links.findIndex((l) => l.kind === 'conflicts');
    expect(linkIndex(m, linkKey(m, conflict) as string)).toBe(conflict);
    expect(linkKey(m, m.links.findIndex((l) => l.kind === 'mentions'))).toBeUndefined();
    // A node's key, and a link whose end is not drawn, name no link.
    expect(linkIndex(m, 'ent_g')).toBeUndefined();
    expect(linkIndex(m, 'link:relates\u001fnobody\u001fent_k\u001ffails over to')).toBeUndefined();
  });

  it('selects a relationship with its two ends and its label lit', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const link = relationLink(m, GRAPH.relations[0]) as number;
    const s = linkSelection(m, GRAPH, link);
    expect(s.points.map((i) => m.nodes[i].label)).toEqual(['gateway 7', 'kandy']);
    expect(s.links).toEqual([link]);
    expect(s.tags).toEqual([{ link, text: 'fails over to', detail: 'Gateway 7 fails over to Kandy when it is down.', lit: true }]);
    expect(relationOf(m, GRAPH, link)).toBe(GRAPH.relations[0]);
    expect(relationOf(m, GRAPH, m.links.findIndex((l) => l.kind === 'mentions'))).toBeUndefined();
    expect(relationLink(m, { subjectId: 'ent_g', relation: 'owns', objectId: 'ent_k', recordNodeIds: [] })).toBeUndefined();
  });

  it('selects a conflict with every entity and relationship on both sides, all labelled', () => {
    const m = exploreModel(withConflict, { records: true, entities: true, detail: 'all' });
    const line = conflictLink(m, withConflict.conflicts[0]) as number;
    expect(m.links[line].kind).toBe('conflicts');
    expect(conflictsOn(m, withConflict, line)).toEqual([{ index: 0, conflict: withConflict.conflicts[0] }]);
    expect(conflictsOn(m, withConflict, relationLink(m, second) as number)).toEqual([]);
    const s = linkSelection(m, withConflict, line);
    expect(s.points.map((i) => m.nodes[i].label).sort()).toEqual(['gateway 7', 'kandy', 'vault']);
    expect(s.links).toHaveLength(3);
    expect(s.tags.map((t) => [t.text, t.tone ?? '', t.lit])).toEqual([
      ['contradicts', 'conflict', true],
      ['fails over to', '', true],
      ['fails over to', '', true],
    ]);
    expect(relationSentence(withConflict, second)).toBe('gateway 7 fails over to vault');
    expect(sameRelation(second, { ...second, recordNodeIds: [] })).toBe(true);
    expect(sameRelation(second, GRAPH.relations[0])).toBe(false);
    // With one end hidden by a source filter, the conflict is not drawn and has no line.
    const hidden = exploreModel(withConflict, { records: true, entities: true, detail: 'all', sourceId: 'src_a' });
    expect(conflictLink(hidden, withConflict.conflicts[0])).toBeUndefined();
  });
});

describe('citations', () => {
  it('reads single and grouped markers', () => {
    expect([...citedPassages('One [1]. Two [2, 3]. None.')].sort()).toEqual([1, 2, 3]);
    expect(citedPassages(undefined).size).toBe(0);
  });

  it('returns the sentences citing a passage without their markers', () => {
    const answer = 'The train ships on Tuesday [1]. The cache is in eu-west-2 [1, 2]. Ask ops [2].';
    expect(sentencesCiting(answer, 1)).toEqual(['The train ships on Tuesday.', 'The cache is in eu-west-2.']);
    expect(sentencesCiting(answer, 3)).toEqual([]);
  });

  it('joins a marker after the full stop to the sentence before it', () => {
    const answer = 'The checkpoint is error rate below 1 percent for ten minutes. [1] Ask ops first. [2, 3]';
    expect(answerSentences(answer)).toHaveLength(2);
    expect(sentencesCiting(answer, 1)).toEqual(['The checkpoint is error rate below 1 percent for ten minutes.']);
    expect(sentencesCiting(answer, 3)).toEqual(['Ask ops first.']);
    expect(derivationSummary({ answer, evidence: [evidence('e1', 'a'), evidence('e2', 'b'), evidence('e3', 'c')], facts: [] }).sentences).toBe(2);
  });

  it('names ranks', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe('facts on the graph', () => {
  const facts = [
    { subject: 'gateway 7', relation: 'fails over to', object: 'kandy', evidenceIds: ['e1'], text: 'Gateway 7 does fail over to Kandy.' },
    { subject: 'Kandy', relation: 'is run by', object: 'duty manager', evidenceIds: ['e2'], linkedThrough: 'vault' },
  ];

  it('keeps the facts’ entities in the key view', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'key', keepNames: factEntityNames(facts) });
    expect(m.nodes.filter((n) => n.kind === 'entity').map((n) => n.label)).toEqual(['gateway 7', 'kandy', 'vault']);
    expect(exploreModel(GRAPH, { records: true, entities: true, detail: 'key' }).nodes.filter((n) => n.kind === 'entity')).toHaveLength(1);
  });

  it('lights the facts’ entities and the relationship between them, and names what the graph does not hold', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const s = factSelection(m, GRAPH, facts);
    expect(s.points.map((i) => m.nodes[i].label).sort()).toEqual(['gateway 7', 'kandy', 'vault']);
    expect(s.links.map((i) => m.links[i].label)).toEqual(['fails over to']);
    expect(s.tags).toEqual([{ link: s.links[0], text: 'fails over to', detail: 'Gateway 7 does fail over to Kandy.' }]);
    expect(s.missing).toEqual(['duty manager']);
  });

  it('narrows to one entity or one passage', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const kandy = factSelection(m, GRAPH, facts, { entity: 'kandy' });
    expect(kandy.points.map((i) => m.nodes[i].label).sort()).toEqual(['gateway 7', 'kandy']);
    expect(kandy.links).toHaveLength(1);
    const passage = factSelection(m, GRAPH, facts, { evidenceId: 'e2' });
    expect(passage.points.map((i) => m.nodes[i].label)).toEqual(['kandy']);
    expect(passage.links).toHaveLength(0);
    expect(passage.missing).toEqual(['duty manager']);
    expect(entityId(GRAPH, 'VAULT')).toBe('ent_v');
    expect(entityId(GRAPH, 'nobody')).toBeUndefined();
    expect(entityIndex(m, GRAPH, 'VAULT')).toBe(m.index.get('ent_v'));
    expect(entityIndex(m, GRAPH, 'nobody')).toBeUndefined();
  });

  it('draws a conflict between the two ends that differ and lists it on both entities', () => {
    // The check says "gateway 7 fails over to kandy" and "gateway 7 fails over to vault" cannot both be true.
    const second = { subjectId: 'ent_g', relation: 'fails over to', objectId: 'ent_v', recordNodeIds: ['rec_ops'] };
    const withConflict: ContextGraph = {
      ...GRAPH,
      relations: [...GRAPH.relations, second],
      conflicts: [{ first: GRAPH.relations[0], second, reason: 'Two different failover targets.', confidence: 0.9 }],
    };
    expect(conflictEnds(withConflict.conflicts[0])).toEqual(['ent_k', 'ent_v']);
    const m = exploreModel(withConflict, { records: true, entities: true, detail: 'all' });
    const link = m.links.find((l) => l.kind === 'conflicts');
    expect(link && [m.nodes[link.source].key, m.nodes[link.target].key, link.label, link.text]).toEqual(['ent_k', 'ent_v', 'contradicts', 'Two different failover targets.']);
    // The conflict keeps its own colour when lit, and reads off the canvas like a relationship.
    const at = m.links.indexOf(link!);
    const lit = litLinkColors(m, PALETTE, { points: [], links: [at] }, PALETTE.lit);
    near(lit.slice(at * 4, at * 4 + 3), PALETTE.link.conflicts.slice(0, 3));
    expect(relationTags(m, { points: [], links: [m.links.indexOf(link!)] })).toEqual([{ link: m.links.indexOf(link!), text: 'contradicts', detail: 'Two different failover targets.', tone: 'conflict' }]);
    // On the entity panel, both sides as sentences, for every entity that takes part.
    const onGateway = entityConflicts(withConflict, 'ent_g');
    expect(onGateway).toEqual([{ index: 0, first: 'gateway 7 fails over to kandy', second: 'gateway 7 fails over to vault', reason: 'Two different failover targets.', confidence: 0.9 }]);
    expect(entityConflicts(withConflict, 'ent_v')).toHaveLength(1);
    expect(entityConflicts(GRAPH, 'ent_g')).toEqual([]);
    // Given the model, each conflict says whether its line is drawn, so a panel can grey out one that is not.
    expect(entityConflicts(withConflict, 'ent_g', m)[0].drawn).toBe(true);
    // Narrowed to one source, a conflict needs both of its relationships shown.
    const narrowed = exploreModel(withConflict, { records: true, entities: true, detail: 'all', sourceId: 'src_a' });
    expect(narrowed.links.some((l) => l.kind === 'conflicts')).toBe(false);
    expect(entityConflicts(withConflict, 'ent_g', narrowed)[0].drawn).toBe(false);
    // An answer's conflict lights both of its facts and the red line between the ends that differ.
    const sides = { first: { subject: 'gateway 7', relation: 'fails over to', object: 'kandy', evidenceIds: ['e1'] }, second: { subject: 'gateway 7', relation: 'fails over to', object: 'vault', evidenceIds: ['e2'] } };
    expect(queryConflictLink(m, withConflict, { ...sides, reason: '', confidence: null })).toBe(at);
    expect(queryConflictLink(narrowed, withConflict, { ...sides, reason: '', confidence: null })).toBeUndefined();
    const answered = factSelection(m, withConflict, [], {}, [{ ...sides, reason: 'Two different failover targets.', confidence: 0.9 }]);
    expect(answered.points.map((i) => m.nodes[i].key).sort()).toEqual(['ent_g', 'ent_gb', 'ent_k', 'ent_v'].filter((k) => k !== 'ent_gb'));
    expect(answered.tags.map((t) => t.text).sort()).toEqual(['contradicts', 'fails over to', 'fails over to']);
    // Narrowed to one passage, the conflict line lights only when both sides stand on it.
    expect(factSelection(m, withConflict, [], { evidenceId: 'e1' }, [{ ...sides, reason: '', confidence: null }]).tags.map((t) => t.text)).toEqual(['fails over to']);
  });

  it('draws no conflict line while a relationship behind it is not drawn', () => {
    // "gateway 7 fails over to kandy" and "vault fails over to kandy" disagree: the ends that differ are gateway 7 and vault.
    const second = { subjectId: 'ent_v', relation: 'fails over to', objectId: 'ent_k', recordNodeIds: ['rec_ops'] };
    const withConflict: ContextGraph = { ...GRAPH, relations: [...GRAPH.relations, second], conflicts: [{ first: GRAPH.relations[0], second, reason: '', confidence: null }] };
    expect(exploreModel(withConflict, { records: true, entities: true, detail: 'all' }).links.some((l) => l.kind === 'conflicts')).toBe(true);
    // Key entities only: kandy, mentioned once with two relationships, is dropped. Both ends of the conflict are
    // drawn, but neither relationship is, so no red line is drawn between gateway 7 and vault.
    const key = exploreModel(withConflict, { records: true, entities: true, detail: 'key', keepNames: new Set(['vault']) });
    expect([key.index.has('ent_g'), key.index.has('ent_v'), key.index.has('ent_k')]).toEqual([true, true, false]);
    expect(key.links.some((l) => l.kind === 'conflicts')).toBe(false);
    expect(conflictLink(key, withConflict.conflicts[0])).toBeUndefined();
  });

  it('tells two entities of one name apart by their kind', () => {
    // "gateway 7" is a system and also a building: two entities, two ids.
    const twins: ContextGraph = {
      ...GRAPH,
      entities: [...GRAPH.entities, { id: 'ent_gb', name: 'gateway 7', kind: 'building', mentions: 1 }],
      mentions: [...GRAPH.mentions, { entityId: 'ent_gb', recordNodeId: 'rec_fail', chunks: 1 }],
      relations: [...GRAPH.relations, { subjectId: 'ent_gb', relation: 'stands in', objectId: 'ent_k', recordNodeIds: ['rec_fail'] }],
    };
    expect(entityId(twins, 'gateway 7', 'building')).toBe('ent_gb');
    expect(entityId(twins, 'gateway 7', 'system')).toBe('ent_g');
    // Without a kind, or with one no entity of the name has, the first of the name.
    expect(entityId(twins, 'gateway 7')).toBe('ent_g');
    expect(entityId(twins, 'gateway 7', 'animal')).toBe('ent_g');
    const m = exploreModel(twins, { records: true, entities: true, detail: 'all' });
    const fact = { subject: 'gateway 7', subjectKind: 'building', relation: 'stands in', object: 'kandy', evidenceIds: ['e1'] };
    const building = factSelection(m, twins, [fact], { entity: 'gateway 7', entityKind: 'building' });
    expect(building.points.map((i) => m.nodes[i].key).sort()).toEqual(['ent_gb', 'ent_k']);
    expect(building.links.map((i) => m.links[i].label)).toEqual(['stands in']);
    // The system of that name has no part in the building's fact.
    const system = factSelection(m, twins, [fact], { entity: 'gateway 7', entityKind: 'system' });
    expect(system.points.map((i) => m.nodes[i].key)).toEqual(['ent_g']);
    expect(system.links).toHaveLength(0);
  });

  it('colours the lit points in the given colour', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    const colors = litPointColors(m, PALETTE, { points: [m.index.get('ent_k') as number], links: [] }, PALETTE.lit);
    const k = m.index.get('ent_k') as number;
    near(colors.slice(k * 4, k * 4 + 4), PALETTE.lit);
    near(colors.slice(0, 4), PALETTE.node.record);
  });

  it('summarises an answer', () => {
    const result = {
      answer: 'Gateway 7 fails over to Kandy [1]. Ask the duty manager [2].',
      evidence: [evidence('e1', 'failover.txt'), evidence('e2', 'oncall.md'), evidence('e3', 'pay.txt')],
      facts: [...facts, { subject: 'ghost', relation: 'haunts', object: 'nobody', evidenceIds: ['e9'] }],
    };
    expect(derivationSummary(result)).toEqual({ sentences: 2, passages: 2, entities: 3 });
    expect(derivationSummary({ evidence: result.evidence, facts: [] })).toEqual({ sentences: 0, passages: 3, entities: 0 });
  });
});
