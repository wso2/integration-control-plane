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
import { CONTEXT_ENGINE_QUESTIONS_KEY_PREFIX } from '../constants/contextEngine';
import type { AskedQuestion } from '../types/contextEngine';
import { clearQuestions, rememberQuestion } from './contextQuestions';

const asked = (engineId: string, queryId: string): AskedQuestion => ({ queryId, engineId, question: `Question ${queryId}`, mode: 'answer', askedAt: '2026-11-03T00:00:00.000Z', outcome: 'answered', passages: 1 });
const stored = (engineId: string): unknown[] => JSON.parse(localStorage.getItem(`${CONTEXT_ENGINE_QUESTIONS_KEY_PREFIX}${engineId}`) ?? '[]') as unknown[];

describe('recent questions', () => {
  it('clears one engine list and leaves the others', () => {
    rememberQuestion(asked('e1', 'q1'));
    rememberQuestion(asked('e1', 'q2'));
    rememberQuestion(asked('e2', 'q3'));
    clearQuestions('e1');
    expect(stored('e1')).toEqual([]);
    expect(stored('e2')).toHaveLength(1);
  });
});
