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
import { BARE_VALUE_FIELD, EMPTY_CHANGE, buildFormResult, diffFormValues, formIsAuthoritative, formValuesForRaw, formValuesFromObject, parseFormSchema, parseRawJson, parseSchemaForm, withValueShapes } from './schemaForm';
import type { FormField } from './schemaForm';

/** Ported from ICP's `helpers.test.ts`. */

// The schema a review activity's arguments arrive with: free text, a number, a nested group.
const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    note: { type: 'string' },
    count: { type: 'integer' },
    address: { type: 'object', properties: { city: { type: 'string' } } },
  },
  required: ['note'],
});

const fields = (): FormField[] => {
  const parsed = parseFormSchema(SCHEMA);
  if (!parsed) throw new Error('fixture schema must parse into fields');
  return parsed;
};

const MULTILINE = 'Dear customer,\n\nYour order shipped.\n';

describe('buildFormResult', () => {
  it('submits a string exactly as entered, including its line breaks', () => {
    const f = fields();
    const values = formValuesFromObject(f, { note: MULTILINE, count: 2 });
    const { result, errors } = buildFormResult(f, values);

    expect(errors).toEqual({});
    // The trailing newline matters: trimming it is what made a retried activity fail again.
    expect(result.note).toBe(MULTILINE);
  });

  it('keeps whitespace a person deliberately typed around a value', () => {
    const f = fields();
    const { result } = buildFormResult(f, { note: '  padded  ' });

    expect(result.note).toBe('  padded  ');
  });

  it('still trims when coercing a number, and still reports a blank required field', () => {
    const f = fields();
    const { result } = buildFormResult(f, { note: ' n ', count: '  7  ' });
    expect(result.count).toBe(7);

    const blank = buildFormResult(f, { note: '   ' });
    expect(blank.errors.note).toBe('Note is required.');
    expect('note' in blank.result).toBe(false);
  });

  it('round-trips a multiline value through the form unchanged', () => {
    const f = fields();
    const original = {
      note: MULTILINE,
      count: 1,
      address: { city: 'Colombo' },
    };
    const { result } = buildFormResult(f, formValuesFromObject(f, original));

    expect(result).toEqual(original);
  });
});

describe('formValuesForRaw', () => {
  it('keeps keys the schema never described, so raw mode can reach them', () => {
    const f = fields();
    const recorded = { note: MULTILINE, count: 3, undeclared: 'keep me' };
    const seeded = formValuesForRaw(f, formValuesFromObject(f, recorded), recorded);

    expect(seeded).toEqual(recorded);
    // The submit projection is what raw mode used to open on, and it drops the extra key.
    expect(buildFormResult(f, formValuesFromObject(f, recorded)).result).not.toHaveProperty('undeclared');
  });

  it('keeps a value the schema cannot coerce as the text that was typed', () => {
    const f = fields();
    const base = { note: 'n', count: 3 };
    const halfTyped = { ...formValuesFromObject(f, base), count: '12abc' };

    expect(formValuesForRaw(f, halfTyped, base).count).toBe('12abc');
    // buildFormResult would drop it entirely, so switching to JSON lost what was being typed.
    const built = buildFormResult(f, halfTyped);
    expect('count' in built.result).toBe(false);
    expect(built.errors.count).toBeDefined();
  });

  it('lays the form’s edits over the recorded value', () => {
    const f = fields();
    const base = { note: 'before', count: 3, address: { city: 'Colombo' } };
    const edited = {
      ...formValuesFromObject(f, base),
      note: 'after\nwith a break',
    };

    expect(formValuesForRaw(f, edited, base)).toEqual({
      note: 'after\nwith a break',
      count: 3,
      address: { city: 'Colombo' },
    });
  });

  it('keeps a value that was already blank, which nobody cleared', () => {
    const f = fields();
    const base = { note: '', count: 3 };
    const untouched = formValuesFromObject(f, base);

    // An empty string the caller sent is a value; dropping its key would change what is submitted.
    expect(formValuesForRaw(f, untouched, base)).toEqual({
      note: '',
      count: 3,
    });
  });

  it('drops a field that was cleared, rather than resurrecting it from the base', () => {
    const f = fields();
    const base = { note: 'n', count: 3 };
    const cleared = { ...formValuesFromObject(f, base), count: '' };

    expect(formValuesForRaw(f, cleared, base)).toEqual({ note: 'n' });
  });

  it('works with no base, and ignores a base that is not an object', () => {
    const f = fields();
    const values = formValuesFromObject(f, { note: 'n', count: 1 });

    expect(formValuesForRaw(f, values)).toEqual({ note: 'n', count: 1 });
    expect(formValuesForRaw(f, values, 'not an object')).toEqual({
      note: 'n',
      count: 1,
    });
    expect(formValuesForRaw(f, values, null)).toEqual({ note: 'n', count: 1 });
  });
});

describe('parseRawJson', () => {
  it('treats blank as an empty object and rejects invalid JSON', () => {
    expect(parseRawJson('   ')).toEqual({ value: {} });
    expect(parseRawJson('{"a":1}')).toEqual({ value: { a: 1 } });
    expect(parseRawJson('{ not json')).toBeNull();
  });

  it('submits what was typed verbatim, including newlines inside a string', () => {
    const parsed = parseRawJson(JSON.stringify({ note: MULTILINE }));
    expect(parsed?.value).toEqual({ note: MULTILINE });
  });
});

describe('formIsAuthoritative', () => {
  it('is true only while the form is the thing on screen', () => {
    const f = fields();

    expect(formIsAuthoritative(f, false)).toBe(true);
    // Raw mode bypasses the form: what it holds is not what will be submitted.
    expect(formIsAuthoritative(f, true)).toBe(false);
    // No schema, no form: the JSON editor is all there is, in either mode.
    expect(formIsAuthoritative(null, false)).toBe(false);
    expect(formIsAuthoritative(null, true)).toBe(false);
  });
});

describe('withValueShapes', () => {
  // What the engine sends when it derives a review's schema from the recorded arguments: an object
  // argument typed only as `object`.
  const BARE = parseFormSchema(
    JSON.stringify({
      type: 'object',
      properties: { claim: { type: 'object' }, note: { type: 'string' } },
    }),
  );
  const ARGS = {
    claim: {
      id: 'C-1',
      amount: 120.5,
      urgent: true,
      address: { city: 'Colombo' },
    },
    note: 'hi',
  };

  it('reads an undescribed object argument’s fields off its recorded value', () => {
    const shaped = withValueShapes(BARE, ARGS);
    const claim = shaped?.find((f) => f.name === 'claim');
    expect(claim?.fields?.map((f) => [f.name, f.type])).toEqual([
      ['id', 'string'],
      ['amount', 'number'],
      ['urgent', 'boolean'],
      ['address', 'object'],
    ]);
    expect(claim?.fields?.[3].fields?.map((f) => f.name)).toEqual(['city']);
  });

  it('round-trips the recorded arguments through the derived form', () => {
    const shaped = withValueShapes(BARE, ARGS)!;
    const { result, errors } = buildFormResult(shaped, formValuesFromObject(shaped, ARGS));
    expect(errors).toEqual({});
    expect(result).toEqual(ARGS);
  });

  it('leaves a schema that describes its objects alone, and lists as JSON', () => {
    const described = parseFormSchema(SCHEMA)!;
    expect(withValueShapes(described, { address: { city: 'X' } })).toEqual(described);
    const listed = withValueShapes(
      parseFormSchema(
        JSON.stringify({
          type: 'object',
          properties: { items: { type: 'array' } },
        }),
      ),
      { items: [{ a: 1 }] },
    );
    expect(listed?.[0].fields).toBeUndefined();
  });

  it('builds the whole form from the value when there is no schema at all', () => {
    expect(withValueShapes(null, { a: 1 })?.map((f) => f.name)).toEqual(['a']);
    expect(withValueShapes(null, null)).toBeNull();
  });
});

describe('schemas the Ballerina generator emits', () => {
  const parse = (schema: unknown): FormField[] => {
    const parsed = parseFormSchema(JSON.stringify(schema));
    if (!parsed) throw new Error('fixture schema must parse into fields');
    return parsed;
  };

  it('edits a json or anydata value (`true`) as JSON, never as "[object Object]"', () => {
    const f = parse({
      type: 'object',
      properties: { to: { type: 'string' }, payload: true },
    });
    expect(f.find((x) => x.name === 'payload')?.type).toBe('json');

    const recorded = { to: 'a@b.c', payload: { orderId: 1 } };
    const values = formValuesFromObject(f, recorded);
    expect(values.payload).toBe('{\n  "orderId": 1\n}');

    const edited = { ...values, to: 'x@y.z' };
    expect(buildFormResult(f, edited)).toEqual({
      result: { to: 'x@y.z', payload: { orderId: 1 } },
      errors: {},
    });
    expect(formValuesForRaw(f, edited, recorded)).toEqual({
      to: 'x@y.z',
      payload: { orderId: 1 },
    });
  });

  it('round-trips a json value that is a string or null', () => {
    const f = parse({ type: 'object', properties: { payload: true } });
    ['text', null, 3, [1, 2]].forEach((payload) => {
      const { result, errors } = buildFormResult(f, formValuesFromObject(f, { payload }));
      expect(errors).toEqual({});
      expect(result).toEqual({ payload });
    });
  });

  it('edits an anyOf of records as JSON', () => {
    const f = parse({
      type: 'object',
      properties: {
        target: {
          anyOf: [
            { type: 'object', properties: { a: { type: 'string' } } },
            { type: 'object', properties: { b: { type: 'integer' } } },
          ],
        },
      },
      required: ['target'],
    });
    expect(f[0]).toMatchObject({ type: 'json', required: true });
    expect(f[0].nullable).toBeUndefined();

    const recorded = { target: { b: 2 } };
    expect(buildFormResult(f, formValuesFromObject(f, recorded)).result).toEqual(recorded);
  });

  it('submits a blank required nilable field as null, not "is required"', () => {
    // `string? approver;` is emitted required: Ballerina wants it present, possibly as nil.
    const f = parse({
      type: 'object',
      properties: {
        approver: { type: ['string', 'null'] },
        level: { enum: ['low', 'high', null], type: ['string', 'null'] },
        target: {
          anyOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'object', properties: { b: { type: 'string' } } }, { type: 'null' }],
        },
      },
      required: ['approver', 'level', 'target'],
    });
    expect(f.map((x) => x.nullable)).toEqual([true, true, true]);

    const recorded = { approver: null, level: null, target: null };
    const { result, errors } = buildFormResult(f, formValuesFromObject(f, recorded));
    expect(errors).toEqual({});
    expect(result).toEqual(recorded);
  });

  it('keeps a required nilable group null, and still requires a non-nilable field', () => {
    const f = parse({
      type: 'object',
      properties: {
        address: {
          type: ['object', 'null'],
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
        note: { type: 'string' },
      },
      required: ['address', 'note'],
    });
    const recorded = { address: null, note: 'n' };
    const values = formValuesFromObject(f, recorded);

    expect(buildFormResult(f, values)).toEqual({
      result: recorded,
      errors: {},
    });
    expect(formValuesForRaw(f, values, recorded)).toEqual(recorded);
    expect(buildFormResult(f, { ...values, note: '' }).errors).toEqual({
      note: 'Note is required.',
    });
  });
});

describe('formValuesForRaw over recorded arguments', () => {
  it('lays only the edits over them, so what the form cannot hold survives', () => {
    const f = fields();
    // A null, a rest field the schema does not describe, and a number where it says string.
    const recorded = { note: 7, count: null, extra: 'x' };
    const values = formValuesFromObject(f, recorded);

    expect(formValuesForRaw(f, values, recorded)).toEqual(recorded);
    expect(formValuesForRaw(f, { ...values, count: '2' }, recorded)).toEqual({
      ...recorded,
      count: 2,
    });
  });

  it('keeps a nested group nobody touched, even one recorded as null', () => {
    const f = fields();
    const recorded = { note: 'n', address: null };
    expect(formValuesForRaw(f, { ...formValuesFromObject(f, recorded), note: 'm' }, recorded)).toEqual({ note: 'm', address: null });
  });
});

describe('number fields', () => {
  const f = parseFormSchema(
    JSON.stringify({
      type: 'object',
      properties: { n: { type: 'number' }, i: { type: 'integer' } },
    }),
  )!;

  it('accepts plain decimal notation', () => {
    expect(buildFormResult(f, { n: '-2.5e3', i: '-42' }).result).toEqual({
      n: -2500,
      i: -42,
    });
  });

  it('refuses hex, Infinity, and integers a JS number cannot hold exactly', () => {
    expect(buildFormResult(f, { n: '0x1F', i: '0x1F' }).errors).toEqual({
      n: 'N must be a number.',
      i: 'I must be an integer.',
    });
    expect(buildFormResult(f, { n: 'Infinity' }).errors).toEqual({
      n: 'N must be a number.',
    });
    expect(buildFormResult(f, { i: '9007199254740993' }).errors.i).toBe('I must be between -9007199254740991 and 9007199254740991.');
    expect(buildFormResult(f, { i: '1.5' }).errors.i).toBe('I must be an integer.');
  });
});

describe('parseSchemaForm', () => {
  it('gives a schema of one value a single field, flagged bare', () => {
    const { fields: f, bare } = parseSchemaForm('{"type":"string"}', 'Result');
    expect(bare).toBe(true);
    expect(f).toEqual([
      expect.objectContaining({
        name: BARE_VALUE_FIELD,
        type: 'string',
        label: 'Result',
        required: true,
      }),
    ]);
    const { result } = buildFormResult(f!, { [BARE_VALUE_FIELD]: 'approved' });
    expect(result[BARE_VALUE_FIELD]).toBe('approved');
  });

  it('reads an enum and a nilable boolean as one value too', () => {
    expect(parseSchemaForm('{"type":"string","enum":["low","high"]}', 'Result').fields).toEqual([expect.objectContaining({ enumValues: ['low', 'high'], type: 'string' })]);
    const nilable = parseSchemaForm('{"type":["boolean","null"]}', 'Result');
    expect(nilable.fields?.[0]).toMatchObject({
      type: 'boolean',
      nullable: true,
    });
    expect(buildFormResult(nilable.fields!, {}).result).toEqual({
      [BARE_VALUE_FIELD]: null,
    });
  });

  it('leaves objects as they were, and any JSON, maps and lists to the JSON editor', () => {
    expect(parseSchemaForm(SCHEMA, 'Result')).toEqual({
      fields: parseFormSchema(SCHEMA),
      bare: false,
    });
    ['true', '{"type":"object"}', '{"type":"array"}', '', 'not json'].forEach((schema) =>
      expect(parseSchemaForm(schema, 'Result')).toEqual({
        fields: null,
        bare: false,
      }),
    );
  });
});

describe('diffFormValues', () => {
  it('states each edited leaf by its label path, with blanks named as such', () => {
    const f = fields();
    const original = formValuesFromObject(f, { note: 'before', count: 3, address: { city: 'Colombo' } });
    const current = { ...original, note: 'after', count: '', 'address.city': 'Kandy' };
    expect(diffFormValues(f, original, current)).toEqual([
      { path: 'note', label: 'Note', from: 'before', to: 'after' },
      { path: 'count', label: 'Count', from: '3', to: EMPTY_CHANGE },
      { path: 'address.city', label: 'Address \u203a City', from: 'Colombo', to: 'Kandy' },
    ]);
    expect(diffFormValues(f, original, original)).toEqual([]);
  });
});
