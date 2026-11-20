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
import type { Commit } from '../types/repository';
import { findCommitBySha, latestCommitOf } from './commits';

const commit = (sha: string, message: string, isLatest = false): Commit => ({
  sha,
  message,
  isLatest,
  author: { name: 'Ada', date: '2026-09-01T00:00:00Z', email: 'ada@example.com', avatarUrl: '' },
});

const history: Commit[] = [commit('aaaaaaa1111111111111111111111111111111111', 'Add webhook type', true), commit('bbbbbbb2222222222222222222222222222222222', 'Fix schedule validation')];

describe('findCommitBySha', () => {
  // The build records 8 characters (the Argo checkout step truncates); history carries 40.
  it('matches a full history sha from an abbreviated build sha', () => {
    expect(findCommitBySha(history, 'bbbbbbb2')?.message).toBe('Fix schedule validation');
  });

  it('matches an abbreviated history sha from a full build sha', () => {
    const abbreviated = [commit('bbbbbbb2', 'Fix schedule validation')];
    expect(findCommitBySha(abbreviated, 'bbbbbbb2222222222222222222222222222222222')?.message).toBe('Fix schedule validation');
  });

  it('ignores case', () => {
    expect(findCommitBySha(history, 'BBBBBBB2')?.message).toBe('Fix schedule validation');
  });

  it('returns null when the build is older than the fetched window', () => {
    expect(findCommitBySha(history, 'ccccccc3')).toBeNull();
  });

  it('refuses to match on a prefix too short to identify a commit', () => {
    expect(findCommitBySha(history, 'bbb')).toBeNull();
    expect(findCommitBySha([commit('bbb', 'truncated')], 'bbbbbbb2222222222222222222222222222222222')).toBeNull();
  });

  it('returns null when a prefix matches more than one commit', () => {
    const ambiguous = [commit('abc1234aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'first'), commit('abc1234bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'second')];
    expect(findCommitBySha(ambiguous, 'abc1234')).toBeNull();
  });

  it('still resolves an unambiguous commit alongside near-misses', () => {
    const history = [commit('abc1234aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'first'), commit('abc1235bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'second')];
    expect(findCommitBySha(history, 'abc1234a')?.message).toBe('first');
  });

  it('returns null for empty inputs', () => {
    expect(findCommitBySha([], 'aaaaaaa1')).toBeNull();
    expect(findCommitBySha(history, '')).toBeNull();
    expect(findCommitBySha(history, undefined)).toBeNull();
    expect(findCommitBySha(undefined, 'aaaaaaa1')).toBeNull();
  });
});

describe('latestCommitOf', () => {
  it('prefers the flagged commit', () => {
    expect(latestCommitOf(history)?.message).toBe('Add webhook type');
  });

  it('falls back to the first entry when nothing is flagged', () => {
    expect(latestCommitOf([commit('ddddddd4', 'Unflagged')])?.message).toBe('Unflagged');
  });

  it('returns null for an empty list', () => {
    expect(latestCommitOf([])).toBeNull();
    expect(latestCommitOf(undefined)).toBeNull();
  });
});
