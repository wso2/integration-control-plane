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

import { describe, it, expect } from 'vitest';
import { highlightJson, parseJsonSafe } from './json';

describe('parseJsonSafe', () => {
  it('returns null for null, undefined, or empty string', () => {
    expect(parseJsonSafe(null)).toBeNull();
    expect(parseJsonSafe(undefined)).toBeNull();
    expect(parseJsonSafe('')).toBeNull();
  });

  it('parses valid JSON', () => {
    expect(parseJsonSafe('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonSafe('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parseJsonSafe('"hello"')).toBe('hello');
    expect(parseJsonSafe('42')).toBe(42);
    expect(parseJsonSafe('true')).toBe(true);
  });

  it('returns raw string for invalid JSON', () => {
    expect(parseJsonSafe('not json')).toBe('not json');
    expect(parseJsonSafe('{broken')).toBe('{broken');
  });
});

describe('highlightJson', () => {
  it('wraps object keys in tok-key spans', () => {
    const result = highlightJson('{"key": "value"}');
    expect(result).toContain('<span class="tok-key">"key":</span>');
  });

  it('wraps string values in tok-str spans', () => {
    const result = highlightJson('{"k": "val"}');
    expect(result).toContain('<span class="tok-str">"val"</span>');
  });

  it('wraps numbers in tok-num spans', () => {
    const result = highlightJson('{"n": 42}');
    expect(result).toContain('<span class="tok-num">42</span>');
  });

  it('wraps booleans in tok-bool spans', () => {
    const result = highlightJson('{"a": true, "b": false}');
    expect(result).toContain('<span class="tok-bool">true</span>');
    expect(result).toContain('<span class="tok-bool">false</span>');
  });

  it('wraps null in tok-null spans', () => {
    const result = highlightJson('{"x": null}');
    expect(result).toContain('<span class="tok-null">null</span>');
  });

  it('HTML-escapes special characters', () => {
    const result = highlightJson('{"a": "<b>"}');
    expect(result).toContain('&lt;b&gt;');
    expect(result).not.toContain('<b>');
  });
});
