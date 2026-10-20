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
  cosmosBuffers,
  derivationSummary,
  entityIndex,
  entitySize,
  exploreModel,
  factEntityNames,
  factSelection,
  hexToRgba,
  isKeyEntity,
  labelled,
  litLinkColors,
  litPointColors,
  neighbourhood,
  relationTags,
  ordinal,
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
  truncated: false,
};

const PALETTE: GraphPalette = {
  node: { record: hexToRgba('#1d2028'), entity: hexToRgba('#8a92a6') },
  link: { mentions: hexToRgba('#d4d7df'), relates: hexToRgba('#9aa1b1') },
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
    expect(Array.from(cosmosBuffers(exploreModel(GRAPH, { records: true, entities: true, detail: 'all' }), PALETTE).shapes.slice(0, 4))).toEqual([1, 1, 1, 0]);
  });

  it('starts an unplaced graph the same way every time', () => {
    const m = exploreModel(GRAPH, { records: true, entities: true, detail: 'all' });
    expect(Array.from(cosmosBuffers(m, PALETTE).positions)).toEqual(Array.from(cosmosBuffers(m, PALETTE).positions));
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
    expect(entityIndex(m, GRAPH, 'VAULT')).toBe(m.index.get('ent_v'));
    expect(entityIndex(m, GRAPH, 'nobody')).toBeUndefined();
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
