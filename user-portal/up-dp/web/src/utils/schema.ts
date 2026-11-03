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

import i18n from '../i18n';

/**
 * A form from a JSON Schema: the flat object schemas workflows use for their input, human tasks
 * and reviews. A property the form can't draw becomes a JSON field, and a schema it can't read at
 * all leaves the caller to raw JSON.
 */

export type FieldKind = 'text' | 'textarea' | 'email' | 'date' | 'number' | 'integer' | 'boolean' | 'choice' | 'choices' | 'json';

export interface Field {
  name: string;
  label: string;
  description?: string;
  kind: FieldKind;
  required: boolean;
  options: string[];
}

export type FormValues = Record<string, unknown>;

interface PropertySchema {
  type?: string | string[];
  title?: string;
  description?: string;
  format?: string;
  enum?: unknown[];
  items?: { type?: string; enum?: unknown[] };
}

function kindOf(p: PropertySchema): FieldKind {
  const type = Array.isArray(p.type) ? p.type.find((t) => t !== 'null') : p.type;
  if (Array.isArray(p.enum) && p.enum.length) return 'choice';
  switch (type) {
    case 'boolean':
      return 'boolean';
    case 'integer':
      return 'integer';
    case 'number':
      return 'number';
    case 'array':
      return Array.isArray(p.items?.enum) ? 'choices' : 'json';
    case 'object':
      return 'json';
    case 'string':
    case undefined:
      if (p.format === 'date') return 'date';
      if (p.format === 'email') return 'email';
      if (p.format === 'textarea') return 'textarea';
      return 'text';
    default:
      return 'json';
  }
}

/** The fields of an object schema, or null when the schema is absent or not one. */
export function fieldsOf(schemaText: string | null | undefined): Field[] | null {
  if (!schemaText) return null;
  let schema: { type?: string; properties?: Record<string, PropertySchema>; required?: string[] };
  try {
    schema = JSON.parse(schemaText);
  } catch {
    return null;
  }
  if (!schema || typeof schema !== 'object' || !schema.properties) return null;
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, p]) => {
    const kind = kindOf(p);
    const options = kind === 'choice' ? (p.enum ?? []) : kind === 'choices' ? (p.items?.enum ?? []) : [];
    return { name, label: p.title || name, description: p.description, kind, required: required.has(name), options: options.map(String) };
  });
}

export function initialValues(fields: Field[], prefill?: Record<string, unknown> | null): FormValues {
  return Object.fromEntries(
    fields.map((field) => {
      const given = prefill?.[field.name];
      if (field.kind === 'json') return [field.name, given === undefined ? '' : JSON.stringify(given, null, 2)];
      if (field.kind === 'choices') return [field.name, Array.isArray(given) ? given.map(String) : []];
      if (field.kind === 'boolean') return [field.name, given === true];
      return [field.name, given === undefined || given === null ? '' : String(given)];
    }),
  );
}

/** The form as the object it describes, or the errors that stop it, by field name. */
export function toObject(fields: Field[], values: FormValues): { value: Record<string, unknown>; errors: Record<string, string> } {
  const value: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = values[field.name];
    const blank = raw === undefined || raw === '' || (Array.isArray(raw) && raw.length === 0);
    if (field.kind === 'boolean') {
      value[field.name] = raw === true;
      continue;
    }
    if (blank) {
      if (field.required) errors[field.name] = i18n.t('integrations.schema.required');
      continue;
    }
    switch (field.kind) {
      case 'number':
      case 'integer': {
        const n = Number(raw);
        if (Number.isNaN(n) || (field.kind === 'integer' && !Number.isInteger(n))) errors[field.name] = field.kind === 'integer' ? i18n.t('integrations.schema.wholeNumber') : i18n.t('integrations.schema.number');
        else value[field.name] = n;
        break;
      }
      case 'json':
        try {
          value[field.name] = JSON.parse(String(raw));
        } catch {
          errors[field.name] = i18n.t('integrations.schema.validJson');
        }
        break;
      default:
        value[field.name] = raw;
    }
  }
  return { value, errors };
}

export function parseJson(text: string): { value?: unknown; error?: string } {
  if (!text.trim()) return { value: {} };
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : i18n.t('integrations.schema.invalidJson') };
  }
}
