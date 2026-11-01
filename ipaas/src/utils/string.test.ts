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
import { capitalize, toCamelCase, toHandler, formatRepoNameToDisplayName, toProjectHandler, truncate, userInitials, withRandomSuffix } from './string';

describe('capitalize', () => {
  it('uppercases the first character', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('world foo')).toBe('World foo');
  });

  it('leaves already-capitalized strings unchanged', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('toCamelCase', () => {
  it('converts space-separated words', () => {
    expect(toCamelCase('hello world')).toBe('helloWorld');
    expect(toCamelCase('foo bar baz')).toBe('fooBarBaz');
  });

  it('converts hyphen-separated words', () => {
    expect(toCamelCase('hello-world')).toBe('helloWorld');
  });

  it('converts underscore-separated words', () => {
    expect(toCamelCase('hello_world')).toBe('helloWorld');
  });

  it('lowercases first word entirely', () => {
    expect(toCamelCase('HELLO world')).toBe('helloWorld');
  });

  it('handles single word', () => {
    expect(toCamelCase('hello')).toBe('hello');
  });
});

describe('toHandler', () => {
  it('lowercases and replaces non-alphanumeric runs with a hyphen', () => {
    expect(toHandler('My Project 123')).toBe('my-project-123');
    expect(toHandler('Hello  World')).toBe('hello-world');
  });

  it('strips leading and trailing hyphens', () => {
    expect(toHandler('  hello  ')).toBe('hello');
    expect(toHandler('!hello!')).toBe('hello');
  });

  it('collapses multiple separators into one hyphen', () => {
    expect(toHandler('a---b')).toBe('a-b');
  });
});

describe('formatRepoNameToDisplayName', () => {
  it('replaces hyphens with spaces and title-cases each word', () => {
    expect(formatRepoNameToDisplayName('my-project')).toBe('My Project');
    expect(formatRepoNameToDisplayName('hello-world-foo')).toBe('Hello World Foo');
  });

  it('leaves names without hyphens capitalized correctly', () => {
    expect(formatRepoNameToDisplayName('myproject')).toBe('Myproject');
  });
});

describe('withRandomSuffix', () => {
  it('appends the suffix with a hyphen', () => {
    expect(withRandomSuffix('default', 25, '7qspy')).toBe('default-7qspy');
  });

  it('trims the handle so the result fits the maximum length', () => {
    const result = withRandomSuffix('a'.repeat(25), 25, '7qspy');
    expect(result).toHaveLength(25);
    expect(result.endsWith('-7qspy')).toBe(true);
  });

  it('drops a trailing hyphen left by trimming', () => {
    expect(withRandomSuffix('abc-defg', 10, 'xy')).toBe('abc-def-xy');
    expect(withRandomSuffix('abcd-efg', 9, 'xyz')).toBe('abcd-xyz');
  });

  it('generates a lowercase alphanumeric suffix by default', () => {
    expect(withRandomSuffix('default', 25)).toMatch(/^default-[a-z0-9]{5}$/);
  });
});

describe('toProjectHandler', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(toProjectHandler('My Project', 50)).toBe('my-project');
  });

  it('strips special characters', () => {
    expect(toProjectHandler('My Project!', 50)).toBe('my-project');
  });

  it('respects maxLength', () => {
    expect(toProjectHandler('abcde', 3)).toBe('abc');
  });

  it('strips leading and trailing hyphens after truncation', () => {
    // After truncation trailing hyphens from spaces should be removed
    expect(toProjectHandler('ab cd', 3)).toBe('ab');
  });
});

describe('truncate', () => {
  it('leaves strings at or under the limit untouched', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('exactly-ten', 11)).toBe('exactly-ten');
  });

  it('cuts and appends an ellipsis when longer', () => {
    expect(truncate('a-very-long-name', 6)).toBe('a-very…');
  });
});

describe('userInitials', () => {
  it('takes the first and last word of a full name', () => {
    expect(userInitials('Sandamini Perera')).toBe('SP');
    expect(userInitials('Ann Marie de Silva')).toBe('AS');
  });

  it('takes the first two letters of a single word', () => {
    expect(userInitials('sandamini')).toBe('SA');
  });

  it('reads an email by its local part', () => {
    expect(userInitials('john.doe@wso2.com')).toBe('JD');
    expect(userInitials('admin@wso2.com')).toBe('AD');
  });

  it('is empty for a blank name', () => {
    expect(userInitials('  ')).toBe('');
  });
});
