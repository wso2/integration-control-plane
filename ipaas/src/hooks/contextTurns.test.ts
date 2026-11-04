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
import { PLAYGROUND_TURNS_MAX } from '../constants/contextEngine';
import { appendTurn, clearTurns, dismissQuestionFailure, finishQuestion, getPlaygroundConversation, replaceTurns, setPlaygroundMode, startQuestion } from './contextTurns';
import type { PlaygroundTurn } from '../types/contextEngine';

const turn = (n: number): PlaygroundTurn => ({
  question: `Question ${n}`,
  mode: 'context',
  result: { queryId: `q${n}`, state: 'completed', evidence: [{ id: `evi_${n}`, recordId: 'a.md', sourceId: 'src_1', sourceVersion: '1', passage: `Passage ${n}.` }], facts: [], conflicts: [], insufficientEvidence: false, traceId: `t${n}` },
});
const ids = (engineId: string): string[] => getPlaygroundConversation(engineId).turns.map((t) => t.result.queryId);

// The store is keyed per engine and lives for the test file, so every test uses its own engine id.
describe('contextTurns', () => {
  it('keeps an appended turn for the engine', () => {
    appendTurn('e-append', turn(1));
    appendTurn('e-append', turn(2));
    expect(ids('e-append')).toEqual(['q1', 'q2']);
  });

  it('keeps only the newest turns past the cap', () => {
    for (let i = 0; i <= PLAYGROUND_TURNS_MAX; i += 1) appendTurn('e-cap', turn(i));
    expect(ids('e-cap')).toHaveLength(PLAYGROUND_TURNS_MAX);
    expect(ids('e-cap')[0]).toBe('q1');
  });

  it('replaces the conversation with a reopened question and its mode', () => {
    appendTurn('e-replace', turn(1));
    replaceTurns('e-replace', [turn(5)], 'answer');
    expect(getPlaygroundConversation('e-replace').mode).toBe('answer');
    expect(ids('e-replace')).toEqual(['q5']);
  });

  it('leaves the mode unset until one is chosen, so the tab picks its default', () => {
    expect(getPlaygroundConversation('e-fresh').mode).toBeUndefined();
    appendTurn('e-fresh', turn(1));
    expect(getPlaygroundConversation('e-fresh').mode).toBeUndefined();
  });

  it('changes the mode without touching the turns', () => {
    appendTurn('e-mode', turn(1));
    setPlaygroundMode('e-mode', 'answer');
    expect(getPlaygroundConversation('e-mode').mode).toBe('answer');
    expect(ids('e-mode')).toEqual(['q1']);
  });

  it('clears the turns and keeps the mode', () => {
    appendTurn('e-clear', turn(1));
    setPlaygroundMode('e-clear', 'answer');
    clearTurns('e-clear');
    expect(getPlaygroundConversation('e-clear')).toEqual({ turns: [], mode: 'answer' });
  });

  it('answers the same object until something changes', () => {
    const before = getPlaygroundConversation('e-same');
    expect(getPlaygroundConversation('e-same')).toBe(before);
    appendTurn('e-same', turn(1));
    const after = getPlaygroundConversation('e-same');
    expect(after).not.toBe(before);
    expect(getPlaygroundConversation('e-same')).toBe(after);
  });

  it('keeps a pending question until its answer arrives', () => {
    const token = startQuestion('e-pending', 'q', 'answer');
    expect(getPlaygroundConversation('e-pending').pending).toEqual({ question: 'q', mode: 'answer', token });
    expect(finishQuestion('e-pending', token, { turn: turn(1) })).toBe(true);
    expect(getPlaygroundConversation('e-pending').pending).toBeUndefined();
    expect(ids('e-pending')).toEqual(['q1']);
  });

  it('drops an answer that arrives after the conversation was cleared or replaced', () => {
    const cleared = startQuestion('e-stale', 'q1', 'answer');
    clearTurns('e-stale');
    expect(finishQuestion('e-stale', cleared, { turn: turn(1) })).toBe(false);
    const replaced = startQuestion('e-stale', 'q2', 'answer');
    replaceTurns('e-stale', [turn(3)], 'context');
    expect(finishQuestion('e-stale', replaced, { turn: turn(2) })).toBe(false);
    expect(ids('e-stale')).toEqual(['q3']);
  });

  it('keeps a failure with the mode it was asked in until dismissed or asked again', () => {
    const token = startQuestion('e-fail', 'q', 'answer');
    const error = new Error('down');
    finishQuestion('e-fail', token, { error });
    expect(getPlaygroundConversation('e-fail').failure).toEqual({ error, mode: 'answer' });
    dismissQuestionFailure('e-fail');
    expect(getPlaygroundConversation('e-fail').failure).toBeUndefined();
    finishQuestion('e-fail', startQuestion('e-fail', 'q', 'context'), { error });
    startQuestion('e-fail', 'again', 'context');
    expect(getPlaygroundConversation('e-fail').failure).toBeUndefined();
  });
});
