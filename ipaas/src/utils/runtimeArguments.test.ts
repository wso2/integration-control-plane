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
import { AFTER_REPEATED_ERROR, POSITIONAL_GAP_ERROR, buildExecutionArgumentsFromForm, hasAnyFormData, parseRuntimeArgumentsToFormFields, validatePositionalOrder, validateRequiredFields } from './runtimeArguments';
import type { RuntimeArgument } from '../types/executions';

describe('parseRuntimeArgumentsToFormFields', () => {
  it('maps each type to the right input widget', () => {
    const args: RuntimeArgument[] = [
      { name: 'name', type: 'string' },
      { name: 'count', type: 'int' },
      { name: 'verbose', type: 'boolean', prefix: '--verbose' },
      { name: 'level', type: 'enum', values: ['INFO', 'WARN'] },
      { name: 'levels', type: 'enum', values: ['INFO', 'WARN'], repeat: true },
      { name: 'tags', type: 'string', repeat: true },
    ];
    expect(parseRuntimeArgumentsToFormFields(args).map((f) => f.inputType)).toEqual(['text', 'number', 'checkbox', 'dropdown', 'checkbox', 'multi-text']);
  });

  it('required = explicit flag OR no prefix (positional)', () => {
    const fields = parseRuntimeArgumentsToFormFields([
      { name: 'positional', type: 'string' }, // no prefix -> required
      { name: 'flagged', type: 'string', prefix: '--flag' }, // has prefix -> optional
      { name: 'forced', type: 'string', prefix: '--f', required: true },
    ]);
    expect(fields.map((f) => f.required)).toEqual([true, false, true]);
  });

  it('a positional arg the schema marks required: false is optional', () => {
    const fields = parseRuntimeArgumentsToFormFields([
      { name: 'name', type: 'string', required: false }, // has a default
      { name: 'count', type: 'int', required: true },
    ]);
    expect(fields.map((f) => f.required)).toEqual([false, true]);
  });

  it('turns enum values into options and uses displayName as label', () => {
    const [field] = parseRuntimeArgumentsToFormFields([{ name: 'level', type: 'enum', values: ['A', 'B'], displayName: 'Severity' }]);
    expect(field.label).toBe('Severity');
    expect(field.options).toEqual([
      { id: 'A', label: 'A', value: 'A' },
      { id: 'B', label: 'B', value: 'B' },
    ]);
  });
});

describe('validateRequiredFields', () => {
  const fields = parseRuntimeArgumentsToFormFields([
    { name: 'name', type: 'string' },
    { name: 'tags', type: 'string', repeat: true },
    { name: 'opt', type: 'string', prefix: '--opt' },
  ]);

  it('flags empty/blank required fields', () => {
    expect(validateRequiredFields(fields, {})).toEqual({ name: 'This field is required', tags: 'At least one value is required' });
    expect(validateRequiredFields(fields, { name: '   ', tags: [''] }).name).toBe('This field is required');
  });

  it('passes when required values are present; optional (prefixed) never blocks', () => {
    expect(validateRequiredFields(fields, { name: 'x', tags: ['a'] })).toEqual({});
  });
});

describe('validatePositionalOrder', () => {
  // main(string name = "World", int times = 1)
  const args: RuntimeArgument[] = [
    { name: 'name', type: 'string', required: false },
    { name: 'times', type: 'int', required: false },
  ];

  it('flags an empty positional value before a filled one', () => {
    expect(validatePositionalOrder(args, { name: '', times: '5' })).toEqual({ name: POSITIONAL_GAP_ERROR });
  });

  it('allows trailing empty values', () => {
    expect(validatePositionalOrder(args, {})).toEqual({});
    expect(validatePositionalOrder(args, { name: 'Ada' })).toEqual({});
  });

  it('counts values that follow the declared arguments', () => {
    expect(validatePositionalOrder(args, { name: 'Ada' }, true)).toEqual({ times: POSITIONAL_GAP_ERROR });
  });

  it('requires a nilable argument before a filled one, since nil cannot be passed by position', () => {
    // main(string? region, int count)
    const nilableFirst: RuntimeArgument[] = [
      { name: 'region', type: 'string', required: false },
      { name: 'count', type: 'int', required: true },
    ];
    expect(validatePositionalOrder(nilableFirst, { count: '3' })).toEqual({ region: POSITIONAL_GAP_ERROR });
  });

  describe('a repeated argument before others', () => {
    // main(string[] tags, string name, string? suffix)
    const listFirst: RuntimeArgument[] = [
      { name: 'tags', type: 'string', repeat: true, required: false },
      { name: 'name', type: 'string', required: true },
      { name: 'suffix', type: 'string', required: false },
    ];

    it('may stay empty, since the program leaves the values to the parameters after it', () => {
      expect(validatePositionalOrder(listFirst, { tags: [''], name: 'x', suffix: 'y' })).toEqual({});
    });

    it('needs every parameter after it filled once it has values', () => {
      expect(validatePositionalOrder(listFirst, { tags: ['a', 'b'], name: 'x' })).toEqual({ suffix: AFTER_REPEATED_ERROR });
      expect(validatePositionalOrder(listFirst, { tags: ['a', 'b'], name: 'x', suffix: 'y' })).toEqual({});
    });
  });

  it('ignores prefixed options and lets a repeated argument stay empty', () => {
    const mixed: RuntimeArgument[] = [
      { name: 'files', type: 'string', repeat: true },
      { name: 'verbose', type: 'boolean', prefix: '--verbose' },
      { name: 'target', type: 'string' },
    ];
    expect(validatePositionalOrder(mixed, { files: [''], target: 'x' })).toEqual({});
  });

  it('keeps the serialized values in their positions once it passes', () => {
    const formData = { name: 'Ada', times: '5' };
    expect(validatePositionalOrder(args, formData)).toEqual({});
    expect(buildExecutionArgumentsFromForm(args, formData).map((a) => a.argument_value)).toEqual(['Ada', '5']);
  });
});

describe('buildExecutionArgumentsFromForm', () => {
  it('emits positional values directly', () => {
    const args: RuntimeArgument[] = [{ name: 'name', type: 'string' }];
    expect(buildExecutionArgumentsFromForm(args, { name: 'World' })).toEqual([{ argument_name: 'name', argument_value: 'World' }]);
  });

  it('skips empty and blank non-repeat values', () => {
    expect(buildExecutionArgumentsFromForm([{ name: 'name', type: 'string' }], { name: '' })).toEqual([]);
    expect(buildExecutionArgumentsFromForm([{ name: 'name', type: 'string' }], { name: '   ' })).toEqual([]);
  });

  it('boolean emits its prefix only when checked', () => {
    const args: RuntimeArgument[] = [{ name: 'verbose', type: 'boolean', prefix: '--verbose' }];
    expect(buildExecutionArgumentsFromForm(args, { verbose: true })).toEqual([{ argument_name: 'verbose', argument_value: '--verbose' }]);
    expect(buildExecutionArgumentsFromForm(args, { verbose: false })).toEqual([]);
  });

  it('applies delimiter vs. split-entry prefix rules', () => {
    expect(buildExecutionArgumentsFromForm([{ name: 'port', type: 'int', prefix: '--port', delimiter: '=' }], { port: '8080' })).toEqual([{ argument_name: 'port', argument_value: '--port=8080' }]);
    expect(buildExecutionArgumentsFromForm([{ name: 'port', type: 'int', prefix: '--port' }], { port: '8080' })).toEqual([
      { argument_name: 'port', argument_value: '--port' },
      { argument_name: 'port', argument_value: '8080' },
    ]);
  });

  it('repeats one entry per non-empty value', () => {
    const args: RuntimeArgument[] = [{ name: 'tags', type: 'string', repeat: true }];
    expect(buildExecutionArgumentsFromForm(args, { tags: ['a', '', '  ', 'b'] })).toEqual([
      { argument_name: 'tags', argument_value: 'a' },
      { argument_name: 'tags', argument_value: 'b' },
    ]);
  });
});

describe('hasAnyFormData', () => {
  it('is false for empty / all-blank, true once a value exists', () => {
    expect(hasAnyFormData({})).toBe(false);
    expect(hasAnyFormData({ a: '', b: [''] })).toBe(false);
    expect(hasAnyFormData({ a: 'x' })).toBe(true);
    expect(hasAnyFormData({ a: true })).toBe(true);
  });
});
