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
import { PROJECT_HANDLER_MAX_LENGTH, PROJECT_NAME_MIN_LENGTH } from '../constants/project';
import { validateProjectName, validateProjectHandler, normalizeProjectError } from './projectValidation';

describe('validateProjectName', () => {
  it('returns error for empty string', () => {
    expect(validateProjectName('')).toBe('Project name is required.');
    expect(validateProjectName('   ')).toBe('Project name is required.');
  });

  it('returns error when shorter than minimum length', () => {
    const short = 'ab'; // 2 chars, min is 3
    expect(validateProjectName(short)).toContain(`${PROJECT_NAME_MIN_LENGTH}`);
  });

  it('returns error when name does not start with a letter', () => {
    expect(validateProjectName('1project')).not.toBeNull();
    expect(validateProjectName('-project')).not.toBeNull();
  });

  it('returns error for invalid characters', () => {
    expect(validateProjectName('My@Project')).not.toBeNull();
    expect(validateProjectName('proj#name')).not.toBeNull();
  });

  it('returns null for valid names', () => {
    expect(validateProjectName('My Project')).toBeNull();
    expect(validateProjectName('Project-123')).toBeNull();
    expect(validateProjectName('A_b c')).toBeNull();
  });
});

describe('validateProjectHandler', () => {
  it('returns error for empty string', () => {
    expect(validateProjectHandler('')).toBe('Project id is required.');
  });

  it('returns error when longer than max length', () => {
    const long = 'a'.repeat(PROJECT_HANDLER_MAX_LENGTH + 1);
    expect(validateProjectHandler(long)).toContain(`${PROJECT_HANDLER_MAX_LENGTH}`);
  });

  it('returns error for uppercase letters', () => {
    expect(validateProjectHandler('MyProject')).not.toBeNull();
  });

  it('returns error for special characters', () => {
    expect(validateProjectHandler('my_project')).not.toBeNull();
    expect(validateProjectHandler('my project')).not.toBeNull();
  });

  it('returns error when starting or ending with a hyphen', () => {
    expect(validateProjectHandler('-project')).not.toBeNull();
    expect(validateProjectHandler('project-')).not.toBeNull();
  });

  it('returns error for handles that collide with a project-level route', () => {
    expect(validateProjectHandler('redirect')).not.toBeNull();
  });

  it('accepts names that no longer collide with a route', () => {
    expect(validateProjectHandler('import')).toBeNull();
    expect(validateProjectHandler('new')).toBeNull();
    expect(validateProjectHandler('settings')).toBeNull();
  });

  it('returns null for valid handlers', () => {
    expect(validateProjectHandler('my-project')).toBeNull();
    expect(validateProjectHandler('project123')).toBeNull();
    expect(validateProjectHandler('abc')).toBeNull();
  });

  it('accepts single character handler', () => {
    // Single char doesn't hit the start/end check (length < 2)
    expect(validateProjectHandler('a')).toBeNull();
  });
});

describe('normalizeProjectError', () => {
  it('humanizes "Failed to fetch"', () => {
    const result = normalizeProjectError('Failed to fetch');
    expect(result).toContain('Unable to connect');
  });

  it('normalizes duplicate/conflict messages', () => {
    expect(normalizeProjectError('already taken')).toContain('already exists');
    expect(normalizeProjectError('already exists')).toContain('already exists');
    expect(normalizeProjectError('duplicate entry')).toContain('already exists');
    expect(normalizeProjectError('HTTP 409 conflict')).toContain('already exists');
  });

  it('passes through unrecognized messages unchanged', () => {
    const msg = 'Some unexpected error';
    expect(normalizeProjectError(msg)).toBe(msg);
  });
});
