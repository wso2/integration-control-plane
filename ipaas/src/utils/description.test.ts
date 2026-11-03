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
import { DESCRIPTION_MAX_LENGTH, clampDescription, isAtNewlineLimit, toSingleLineDescription } from './description';

describe('clampDescription', () => {
  it('keeps a description within the limits untouched', () => {
    expect(clampDescription('one\ntwo\nthree')).toBe('one\ntwo\nthree');
  });

  it('turns breaks past the limit into spaces', () => {
    expect(clampDescription('a\nb\nc\nd\ne')).toBe('a\nb\nc d e');
  });

  it('collapses a run of blank lines once the limit is spent', () => {
    expect(clampDescription('a\n\n\n\nb')).toBe('a\n\n  b');
  });

  it('counts a CRLF as one break', () => {
    expect(clampDescription('a\r\nb\r\nc\r\nd')).toBe('a\nb\nc d');
  });

  it('truncates to the max length', () => {
    const long = 'x'.repeat(DESCRIPTION_MAX_LENGTH + 50);
    expect(clampDescription(long)).toHaveLength(DESCRIPTION_MAX_LENGTH);
  });

  it('leaves an empty value alone', () => {
    expect(clampDescription('')).toBe('');
  });
});

describe('toSingleLineDescription', () => {
  it('joins lines with a single space', () => {
    expect(toSingleLineDescription('one\ntwo\r\nthree\rfour')).toBe('one two three four');
  });

  it('collapses the spaces and blank lines around a break', () => {
    expect(toSingleLineDescription('one  \n\n  two')).toBe('one two');
  });

  it('leaves text without breaks untouched', () => {
    expect(toSingleLineDescription('a  b')).toBe('a  b');
  });

  it('caps the length', () => {
    expect(toSingleLineDescription('x'.repeat(DESCRIPTION_MAX_LENGTH + 10))).toHaveLength(DESCRIPTION_MAX_LENGTH);
  });
});

describe('isAtNewlineLimit', () => {
  it('is false below the limit', () => {
    expect(isAtNewlineLimit('a')).toBe(false);
    expect(isAtNewlineLimit('a\nb')).toBe(false);
  });

  it('is true at and past the limit', () => {
    expect(isAtNewlineLimit('a\nb\nc')).toBe(true);
    expect(isAtNewlineLimit('a\nb\nc\nd')).toBe(true);
  });
});
