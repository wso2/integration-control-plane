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

import { formatFieldLabel } from '../../../utils/mcp';

/**
 * Turns a JSON Schema into a form, and a filled form back into a typed value.
 *
 * Three engine routes need it and there is no
 * other source of field metadata:
 *
 *   POST /workflows                                 input  <- definitions[].inputSchema
 *   POST /human-tasks/{id}/complete                 result <- HumanTaskInfo.formSchema
 *   POST /review-activities/{id}/proceed-with-input input  <- ReviewActivityInfo.formSchema
 *
 * The engine sends those schemas as **strings**, so `parseJsonSchema` is the one place that decode
 * happens. `normalizeLeafSchema`'s handling of `type: ["string","null"]` unions and
 * `anyOf`/`oneOf`-of-`const` enums is not incidental: Ballerina's record-to-JSON-Schema generation
 * emits exactly those shapes for optional and enum fields. It also emits the boolean schema `true`
 * for `json` and `anydata`, and an `anyOf` for a union of records; both become a `json` field,
 * edited as JSON, since nothing narrower describes them.
 *
 * Values are held flat, keyed by dotted path, because that is what a React form can bind to;
 * `buildFormResult` rebuilds the nesting on the way out.
 */

/** `claimId` -> `Claim Id`: the MCP form's field labels, so both forms name a key alike. */
export const humanizeKey = formatFieldLabel;

/**
 * A field derived from a JSON Schema property. An object property that declares its own
 * `properties` becomes a group (`fields` set) rather than one JSON textarea.
 */
export interface FormField {
  name: string;
  type: string;
  label: string;
  required: boolean;
  /**
   * Null is one of the values: `type: [..., "null"]`, an enum holding null, or an `anyOf`/`oneOf`
   * with a `{type: "null"}` member. The generator marks a nilable record field (`string? b;`)
   * required, since Ballerina requires it present, so a blank one is submitted as null.
   */
  nullable?: boolean;
  description?: string;
  enumValues?: string[];
  fields?: FormField[];
}

export type FormValues = Record<string, string | boolean>;

/** Joins a parent path and a field name into the dotted key a leaf's value is stored under. */
export const fieldPath = (prefix: string, name: string): string => (prefix ? `${prefix}.${name}` : name);

export function jsonPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * The type and value set of one leaf schema, read defensively: `type` may be a string, an array
 * (nullable unions spell `["string","null"]`), or absent; an enum may be a plain `enum`, or an
 * `anyOf`/`oneOf` of `const`/`enum`.
 */
function normalizeLeafSchema(d: Record<string, unknown>): {
  type: string;
  enumValues?: string[];
  nullable?: boolean;
} {
  let type: string | undefined;
  let nullable = Array.isArray(d.enum) && d.enum.includes(null);
  if (typeof d.type === 'string') {
    type = d.type;
  } else if (Array.isArray(d.type)) {
    type = d.type.find((t): t is string => typeof t === 'string' && t !== 'null');
    nullable = nullable || d.type.includes('null');
  }

  const rawEnum = Array.isArray(d.enum) ? d.enum.filter((v) => v !== null) : [];
  let enumValues = rawEnum.length > 0 ? rawEnum.map(String) : undefined;
  let enumSamples: unknown[] = rawEnum;

  let variants: unknown[] | null = null;
  if (Array.isArray(d.anyOf)) {
    variants = d.anyOf;
  } else if (Array.isArray(d.oneOf)) {
    variants = d.oneOf;
  }
  nullable = nullable || (variants ?? []).some((v) => v !== null && typeof v === 'object' && (v as Record<string, unknown>).type === 'null');

  if (!enumValues) {
    if (variants) {
      const collected: unknown[] = [];
      let allLiteral = true;
      variants.forEach((v) => {
        if (!allLiteral) {
          return;
        }
        const vo = v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
        if (vo.const !== undefined) {
          collected.push(vo.const);
        } else if (Array.isArray(vo.enum)) {
          collected.push(...vo.enum.filter((e) => e !== null));
        } else if (vo.type !== 'null') {
          allLiteral = false;
        }
      });
      if (allLiteral && collected.length > 0) {
        enumValues = collected.map(String);
        enumSamples = collected;
      }
    }
  }

  // A value set without a declared type still says what it holds.
  if (!type && enumSamples.length > 0) {
    if (enumSamples.every((v) => typeof v === 'number')) {
      type = enumSamples.every((v) => Number.isInteger(v)) ? 'integer' : 'number';
    } else if (enumSamples.every((v) => typeof v === 'boolean')) {
      type = 'boolean';
    } else {
      type = 'string';
    }
  }
  // No type to read: `true` (json, anydata), or an `anyOf` of records. Any JSON value fits, so it
  // is edited as JSON; reading it as text would seed an object as "[object Object]".
  if (!type) {
    type = d.properties ? 'object' : 'json';
  }
  return {
    type,
    ...(enumValues ? { enumValues } : {}),
    ...(nullable ? { nullable } : {}),
  };
}

function parseObjectSchema(s: unknown): FormField[] | null {
  if (s === null || typeof s !== 'object' || Array.isArray(s)) {
    return null;
  }
  const obj = s as Record<string, unknown>;
  const props = obj.properties;
  if (props === null || typeof props !== 'object' || Array.isArray(props)) {
    return null;
  }
  const required = new Set(Array.isArray(obj.required) ? obj.required.filter((r): r is string => typeof r === 'string') : []);
  const fields = Object.entries(props as Record<string, unknown>).map(([name, def]): FormField => {
    const d = (def !== null && typeof def === 'object' ? def : {}) as Record<string, unknown>;
    const { type, enumValues, nullable } = normalizeLeafSchema(d);
    // An object with its own properties becomes a group; a freeform one stays a JSON textarea.
    const nested = type === 'object' ? parseObjectSchema(d) : null;
    return {
      name,
      type,
      label: typeof d.title === 'string' ? d.title : humanizeKey(name),
      required: required.has(name),
      ...(nullable ? { nullable } : {}),
      description: typeof d.description === 'string' ? d.description : undefined,
      enumValues,
      ...(nested ? { fields: nested } : {}),
    };
  });
  return fields.length > 0 ? fields : null;
}

/** The engine sends schemas as JSON **strings**; this is the only place that is decoded. */
export function parseJsonSchema(raw: string | null | undefined): unknown {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Parses a JSON Schema (object, or a JSON string of one) into a field list. */
export function parseFormSchema(schema: unknown): FormField[] | null {
  const s = typeof schema === 'string' ? parseJsonSchema(schema) : schema;
  return parseObjectSchema(s);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The one field a schema for a single value is edited through; see `parseSchemaForm`. */
export const BARE_VALUE_FIELD = 'value';

/**
 * `parseFormSchema`, plus a form for a schema of one value rather than an object: a human task
 * typed `string`, `boolean` or an enum, or a workflow whose one input parameter is. That becomes a
 * single field named `BARE_VALUE_FIELD` with `bare` set, and its value is submitted as it is, not
 * wrapped in an object. A map, a list or any JSON value still gets no fields: JSON is how to enter it.
 */
export function parseSchemaForm(schema: unknown, valueLabel: string): { fields: FormField[] | null; bare: boolean } {
  const s = typeof schema === 'string' ? parseJsonSchema(schema) : schema;
  const fields = parseObjectSchema(s);
  if (fields || !isPlainObject(s)) {
    return { fields, bare: false };
  }
  const { type, enumValues, nullable } = normalizeLeafSchema(s);
  if (type === 'object' || type === 'array' || type === 'json') {
    return { fields: null, bare: false };
  }
  const field: FormField = {
    name: BARE_VALUE_FIELD,
    type,
    label: typeof s.title === 'string' ? s.title : valueLabel,
    required: true,
    ...(nullable ? { nullable } : {}),
    description: typeof s.description === 'string' ? s.description : undefined,
    enumValues,
  };
  return { fields: [field], bare: true };
}

// A field's type read off a recorded value. Numbers are `number`, never `integer`: one sample
// cannot say a value is whole by type rather than by chance.
function typeOfValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return isPlainObject(value) ? 'object' : 'string';
}

/** Fields read off an object's own keys, for a value the schema leaves undescribed. */
export function fieldsFromValue(value: Record<string, unknown>, depth = 0): FormField[] | null {
  const fields = Object.entries(value).map(([name, v]): FormField => {
    const type = typeOfValue(v);
    const nested = type === 'object' && depth < 3 ? fieldsFromValue(v as Record<string, unknown>, depth + 1) : null;
    return {
      name,
      type,
      label: humanizeKey(name),
      required: false,
      ...(nested ? { fields: nested } : {}),
    };
  });
  return fields.length > 0 ? fields : null;
}

/**
 * The schema's fields, with any object it describes only as `{type: object}` filled in from the
 * recorded value's keys, and every field read off the value when there is no schema at all.
 *
 * A review's schema comes from the reviewed activity's signature, but when the activity is not in
 * the worker's own registry the engine derives it from the recorded arguments instead, and an
 * object argument then arrives as a bare `{type: object}`: a JSON box where the reviewer expects
 * the argument's fields. The recorded value still names them, so the form can.
 */
export function withValueShapes(fields: FormField[] | null, value: unknown): FormField[] | null {
  if (!isPlainObject(value)) {
    return fields;
  }
  if (!fields) {
    return fieldsFromValue(value);
  }
  return fields.map((field) => {
    const v = value[field.name];
    if (field.fields) {
      return {
        ...field,
        fields: withValueShapes(field.fields, v) ?? field.fields,
      };
    }
    if (field.type === 'object' && !field.enumValues && isPlainObject(v)) {
      const nested = fieldsFromValue(v);
      return nested ? { ...field, fields: nested } : field;
    }
    return field;
  });
}

// Plain decimal notation only. `Number()` also reads `0x1F` and `Infinity`, and JSON cannot carry
// Infinity: it is sent as null.
const DECIMAL = /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const INTEGER = /^-?\d+$/;

/** Coerces one leaf's entered value to its schema type, recording any error by dotted path. */
function coerceLeaf(f: FormField, path: string, values: FormValues, result: Record<string, unknown>, errors: Record<string, string>): void {
  // A required field that may be null is present as null when left blank.
  const blank = () => {
    if (f.required && f.nullable) {
      result[f.name] = null;
    } else if (f.required) {
      errors[path] = `${f.label} is required.`;
    }
  };
  if (f.type === 'boolean') {
    const v = values[path];
    if (typeof v === 'boolean') {
      result[f.name] = v;
    } else {
      blank();
    }
    return;
  }
  const raw = values[path];
  const entered = typeof raw === 'string' ? raw : '';
  // Trimmed only to decide blankness and to parse numbers/JSON: a string is submitted exactly as
  // entered, so leading or trailing newlines in the original value survive an untouched field.
  const text = entered.trim();
  if (!text) {
    blank();
    return;
  }
  if (f.type === 'integer') {
    const n = Number(text);
    // A Ballerina int is 64-bit, but a JS number holds integers exactly only up to 2^53: past
    // that it would be submitted rounded, so it is refused instead.
    if (!INTEGER.test(text)) {
      errors[path] = `${f.label} must be an integer.`;
    } else if (!Number.isSafeInteger(n)) {
      errors[path] = `${f.label} must be between ${Number.MIN_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER}.`;
    } else {
      result[f.name] = n;
    }
  } else if (f.type === 'number') {
    const n = Number(text);
    if (!DECIMAL.test(text) || !Number.isFinite(n)) {
      errors[path] = `${f.label} must be a number.`;
    } else {
      result[f.name] = n;
    }
  } else if (f.type === 'object' || f.type === 'array' || f.type === 'json') {
    try {
      result[f.name] = JSON.parse(text);
    } catch {
      errors[path] = `${f.label} must be valid JSON.`;
    }
  } else {
    result[f.name] = entered;
  }
}

/** True when `test` holds for the dotted path of any leaf under `fields`. */
function someLeaf(fields: FormField[], prefix: string, test: (path: string) => boolean): boolean {
  return fields.some((f) => {
    const path = fieldPath(prefix, f.name);
    return f.fields ? someLeaf(f.fields, path, test) : test(path);
  });
}

/** True when any leaf under `fields` has a value: a boolean choice, or non-blank text. */
function hasAnyValue(fields: FormField[], values: FormValues, prefix: string): boolean {
  return someLeaf(fields, prefix, (path) => {
    const v = values[path];
    return typeof v === 'boolean' || (typeof v === 'string' && v.trim() !== '');
  });
}

function buildLevel(fields: FormField[], values: FormValues, prefix: string, errors: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  fields.forEach((f) => {
    const path = fieldPath(prefix, f.name);
    if (f.fields) {
      // A nested object's own `required` list only applies when that object is present, so an
      // optional group left entirely blank is omitted rather than walked; otherwise each of its
      // children reports "is required", which reads as a validation failure for input the schema
      // never asked for. A required one that may be null is present as null.
      if (!hasAnyValue(f.fields, values, path)) {
        if (!f.required) {
          return;
        }
        if (f.nullable) {
          result[f.name] = null;
          return;
        }
      }
      result[f.name] = buildLevel(f.fields, values, path, errors);
      return;
    }
    coerceLeaf(f, path, values, result, errors);
  });
  return result;
}

/** Validates form values against their fields and coerces them to schema types. */
export function buildFormResult(fields: FormField[], values: FormValues): { result: Record<string, unknown>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const result = buildLevel(fields, values, '', errors);
  return { result, errors };
}

function fillValues(fields: FormField[], source: Record<string, unknown>, prefix: string, values: FormValues): void {
  fields.forEach((f) => {
    const path = fieldPath(prefix, f.name);
    const v = source[f.name];
    if (f.fields) {
      fillValues(f.fields, v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}, path, values);
      return;
    }
    // Any JSON value, a string or null included, so always shown as JSON: unquoted text would not
    // parse back.
    if (f.type === 'json') {
      if (v !== undefined) {
        values[path] = jsonPretty(v);
      }
      return;
    }
    if (v === undefined || v === null) {
      return;
    }
    if (f.type === 'boolean') {
      if (typeof v === 'boolean') {
        values[path] = v;
      }
    } else if (f.type === 'object' || f.type === 'array') {
      values[path] = typeof v === 'string' ? v : jsonPretty(v);
    } else {
      values[path] = typeof v === 'string' ? v : String(v);
    }
  });
}

/** The inverse of `buildFormResult`: seeds form values from an existing object. */
export function formValuesFromObject(fields: FormField[], source: Record<string, unknown>): FormValues {
  const values: FormValues = {};
  fillValues(fields, source, '', values);
  return values;
}

/**
 * Lays the form's entered values over `out`, leniently: a value the schema can coerce is coerced, a
 * value it cannot is kept as the text that was typed, and a cleared field is removed (or null, when
 * it is required and may be null, as `buildFormResult` reads it). Unlike
 * `buildFormResult` this never drops anything; it seeds raw mode, where the point is to reach
 * what the form could not express, so a key the schema never modelled and a half-typed number both
 * have to survive the switch.
 */
function overlayValues(fields: FormField[], values: FormValues, prefix: string, out: Record<string, unknown>): void {
  fields.forEach((f) => {
    const path = fieldPath(prefix, f.name);
    if (f.fields) {
      // Nothing entered under the group: whatever `out` carried for it stays, a null included.
      if (!someLeaf(f.fields, path, (p) => values[p] !== undefined)) {
        return;
      }
      const existing = out[f.name];
      const nested: Record<string, unknown> = isPlainObject(existing) ? { ...existing } : {};
      overlayValues(f.fields, values, path, nested);
      // Cleared entirely: as `buildFormResult` reads a blank group.
      if (Object.keys(nested).length > 0) {
        out[f.name] = nested;
      } else if (f.required) {
        out[f.name] = f.nullable ? null : nested;
      } else {
        delete out[f.name];
      }
      return;
    }
    const entered = values[path];
    if (typeof entered === 'boolean') {
      out[f.name] = entered;
      return;
    }
    // Untouched leaf: whatever `out` carried for it stays. Cleared leaf: the clearing is the edit ,
    // but a field that was already blank was not cleared by anyone, and dropping its key would turn
    // an empty string the caller sent into an absent one.
    if (typeof entered !== 'string') {
      return;
    }
    if (entered.trim() === '') {
      if (entered === out[f.name]) {
        return;
      }
      if (f.required && f.nullable) {
        out[f.name] = null;
      } else {
        delete out[f.name];
      }
      return;
    }
    const coerced: Record<string, unknown> = {};
    coerceLeaf(f, path, values, coerced, {});
    out[f.name] = f.name in coerced ? coerced[f.name] : entered;
  });
}

/**
 * `base` (the value the form was seeded from, so keys the schema does not describe survive) with
 * the form's edits laid over it: what raw mode opens with, and what an edited review submits.
 *
 * Only leaves edited away from what `base` seeds are laid over it. Coercing an untouched leaf back
 * from its text would rewrite a value the form cannot hold exactly, such as a null or a number
 * recorded where the schema says string.
 */
export function formValuesForRaw(fields: FormField[], values: FormValues, base?: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  const seeded = formValuesFromObject(fields, out);
  // Blank and absent read the same, as they do in `diffFormValues`.
  const edited: FormValues = {};
  Object.entries(values).forEach(([path, v]) => {
    if (v !== (seeded[path] ?? '')) {
      edited[path] = v;
    }
  });
  overlayValues(fields, edited, '', out);
  return out;
}

/**
 * Whether the generated form is what will be submitted. Raw mode bypasses it, so the form is
 * authoritative only while it is the thing on screen. A type predicate, so a caller that asks gets
 * the fields narrowed and cannot reach for them without asking first.
 */
export const formIsAuthoritative = (fields: FormField[] | null, rawMode: boolean): fields is FormField[] => fields !== null && !rawMode;

/** Parses raw-mode JSON, treating blank as an empty object; null when the text is not JSON. */
export function parseRawJson(text: string): { value: unknown } | null {
  try {
    return { value: text.trim() ? JSON.parse(text) : {} };
  } catch {
    return null;
  }
}

/** How a change names a blank value, on either side of it. */
export const EMPTY_CHANGE = '(empty)';

/** One field edited away from its seeded value; what a review confirms before acting. */
export interface FieldChange {
  path: string;
  label: string;
  from: string;
  to: string;
}

/**
 * Which leaves differ from their seeded values, with display labels: the evidence an edited-rerun
 * confirmation shows, so what changed is stated rather than remembered.
 */
export function diffFormValues(fields: FormField[], original: FormValues, current: FormValues): FieldChange[] {
  const changes: FieldChange[] = [];
  const asText = (v: string | boolean | undefined): string => {
    if (v === undefined) {
      return '';
    }
    if (typeof v === 'boolean') {
      return v ? 'Yes' : 'No';
    }
    return v;
  };
  const walk = (fs: FormField[], prefix: string, labelPrefix: string) => {
    fs.forEach((f) => {
      const path = fieldPath(prefix, f.name);
      // A nested field is named by its path of group labels.
      const label = labelPrefix ? `${labelPrefix} › ${f.label}` : f.label;
      if (f.fields) {
        walk(f.fields, path, label);
        return;
      }
      const from = asText(original[path]);
      const to = asText(current[path]);
      if (from !== to) {
        changes.push({ path, label, from: from || EMPTY_CHANGE, to: to || EMPTY_CHANGE });
      }
    });
  };
  walk(fields, '', '');
  return changes;
}
