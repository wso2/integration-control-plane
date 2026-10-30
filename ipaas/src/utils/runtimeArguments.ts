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

/**
 * Pure transforms backing the Automation "Test" form: schema → form fields,
 * required-field validation, and form data → run-pod arguments. Mirrors Devant's
 * RuntimeArgumentsParser + DynamicForm utils so the two products behave identically
 * against the shared backend. No React, no I/O — unit-testable in isolation.
 */

import type { KeyboardEvent } from 'react';
import type { DynamicFormData, DynamicFormFieldValue, DynamicFormValidationErrors, ExecutionArgument, FormField, FormInputType, FormTileOption, RuntimeArgument, TriggerArgument } from '../types/executions';

const NUMERIC_TYPES = ['number', 'int', 'float', 'decimal', 'byte'];
const REQUIRED_FIELD_ERROR = 'This field is required';
const REQUIRED_MULTI_VALUE_ERROR = 'At least one value is required';
export const POSITIONAL_GAP_ERROR = 'Enter a value: arguments are passed in order, and a later one has a value';
export const AFTER_REPEATED_ERROR = 'Enter a value: an earlier argument takes a list, which would otherwise give its last value to this one';

export const isNumericType = (type: string): boolean => NUMERIC_TYPES.includes(type);

/** Keystroke guard for numeric fields: digits always; `.` once for float/decimal; leading `-` except byte. */
export function blockNonNumericKeys(e: KeyboardEvent<HTMLInputElement>, runtimeType: string, current: string): void {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'].includes(e.key)) return;
  if (/[0-9]/.test(e.key)) return;
  if ((runtimeType === 'float' || runtimeType === 'decimal') && e.key === '.' && !current.includes('.')) return;
  if (runtimeType !== 'byte' && e.key === '-' && current === '') return;
  e.preventDefault();
}

/** The equivalent command line for a set of run arguments, e.g. `<task> "v1" "v2"`. */
export function buildTaskArgsPreview(execArgs: TriggerArgument[]): string {
  if (execArgs.length === 0) return '<task>';
  return `<task> "${execArgs.map((arg) => arg.argument_value.replace(/"/g, '\\"')).join('" "')}"`;
}

// schema → form fields

function getFormInputType(arg: RuntimeArgument): FormInputType {
  const { type, repeat } = arg;
  if (type === 'boolean') return 'checkbox';
  if ((isNumericType(type) || type === 'string') && repeat === true) return 'multi-text';
  if (type === 'enum') return repeat === true ? 'checkbox' : 'dropdown';
  if (isNumericType(type)) return 'number';
  return 'text';
}

/**
 * A field is required when explicitly flagged, OR when it has no `prefix` and does not
 * say otherwise — an arg without a prefix is positional, so a value must be supplied
 * unless the schema marks it `required: false` (a parameter with a default, which the
 * program fills in when trailing values are left out).
 */
function isFieldRequired(arg: RuntimeArgument): boolean {
  if (arg.required === true) return true;
  if (!arg.prefix) return arg.required !== false;
  return false;
}

function convertValuesToOptions(values?: string[]): FormTileOption[] {
  if (!values || values.length === 0) return [];
  return values.map((value) => ({ id: value, label: value, value }));
}

function getPlaceholder(inputType: FormInputType, arg?: RuntimeArgument): string {
  switch (inputType) {
    case 'text':
      return 'Text answer';
    case 'dropdown':
      return 'Choose an option';
    case 'radio':
      return 'Select one';
    case 'checkbox':
      if (arg?.type === 'boolean') return arg.description || 'Check if applicable';
      return 'Select all that apply';
    case 'multi-text':
      return 'Add multiple text entries';
    case 'number':
      return 'Enter number';
    default:
      return 'Your answer';
  }
}

function createFormFieldFromArgument(arg: RuntimeArgument): FormField {
  const inputType = getFormInputType(arg);
  return {
    id: arg.name,
    label: arg.displayName || arg.name,
    description: arg.description || '',
    required: isFieldRequired(arg),
    runtimeType: arg.type,
    inputType,
    options: convertValuesToOptions(arg.values),
    placeholder: getPlaceholder(inputType, arg),
  };
}

export const parseRuntimeArgumentsToFormFields = (runtimeArguments: RuntimeArgument[]): FormField[] => runtimeArguments.map(createFormFieldFromArgument);

// validation

function hasNonEmptyValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some((item) => item && String(item).trim() !== '');
  // A checkbox only counts as input when checked — unchecked (false) is "no value",
  // matching what buildExecutionArgumentsFromForm emits.
  if (typeof value === 'boolean') return value;
  return value !== undefined && value !== null;
}

export function validateRequiredFields(formFields: FormField[], formData: DynamicFormData): DynamicFormValidationErrors {
  const errors: DynamicFormValidationErrors = {};
  formFields.forEach((field) => {
    if (!field.required) return;
    const value = formData[field.id];
    // Multi-text fields always use the multi-value message, whether empty or absent.
    if (field.inputType === 'multi-text') {
      if (!Array.isArray(value) || !hasNonEmptyValue(value)) errors[field.id] = REQUIRED_MULTI_VALUE_ERROR;
      return;
    }
    // An unchecked (false) required checkbox counts as missing, like a blank string.
    if (value === undefined || value === null || value === false || (typeof value === 'string' && value.trim() === '')) {
      errors[field.id] = REQUIRED_FIELD_ERROR;
    }
  });
  return errors;
}

/**
 * Positional arguments bind by position, so an empty one before a filled one would hand
 * the later value to the wrong parameter. That holds for a nilable argument too: nil
 * cannot be passed by position. Flags every such gap; `trailingValues` says values
 * follow the declared arguments.
 *
 * A repeated argument takes every value except one for each positional parameter after
 * it, filled or not (Ballerina's CliSpec). So it may be empty mid-list, leaving the values
 * to the parameters after it; but once it has values, each parameter after it needs one,
 * or the list's last value is bound to it instead.
 */
export function validatePositionalOrder(runtimeArguments: RuntimeArgument[], formData: DynamicFormData, trailingValues = false): DynamicFormValidationErrors {
  const errors: DynamicFormValidationErrors = {};
  const positional = runtimeArguments.filter((arg) => !arg.prefix);
  const filled = positional.map((arg) => hasNonEmptyValue(formData[arg.name]));
  let laterFilled = trailingValues;
  for (let i = positional.length - 1; i >= 0; i -= 1) {
    if (!filled[i] && laterFilled && !positional[i].repeat) errors[positional[i].name] = POSITIONAL_GAP_ERROR;
    if (filled[i]) laterFilled = true;
  }
  const firstFilledRepeat = positional.findIndex((arg, i) => arg.repeat && filled[i]);
  if (firstFilledRepeat >= 0) {
    positional.slice(firstFilledRepeat + 1).forEach((arg, offset) => {
      if (!arg.repeat && !filled[firstFilledRepeat + 1 + offset]) errors[arg.name] ??= AFTER_REPEATED_ERROR;
    });
  }
  return errors;
}

export function hasAnyFormData(formData: DynamicFormData): boolean {
  return Object.keys(formData).length > 0 && Object.values(formData).some((value) => hasNonEmptyValue(value));
}

// form data → run-pod arguments

/** Append one arg's wire entries, applying prefix/delimiter rules, to `out`. */
function pushArgument(out: TriggerArgument[], arg: RuntimeArgument, stringValue: string): void {
  if (!arg.prefix) {
    out.push({ argument_name: arg.name, argument_value: stringValue });
  } else if (arg.delimiter) {
    out.push({ argument_name: arg.name, argument_value: `${arg.prefix}${arg.delimiter}${stringValue}` });
  } else {
    out.push({ argument_name: arg.name, argument_value: arg.prefix }, { argument_name: arg.name, argument_value: stringValue });
  }
}

/**
 * Serialize the dynamic-form state into the run-pod `args` payload. A checked boolean
 * emits its prefix (flag) or, with no prefix, its literal value; an unchecked one emits
 * nothing. Repeated args emit one entry per non-empty value; everything else follows the
 * prefix/delimiter rules above. Empty values are skipped, so the form must first pass
 * validatePositionalOrder: then only trailing positional values can be empty.
 */
export function buildExecutionArgumentsFromForm(runtimeArguments: RuntimeArgument[], formData: DynamicFormData): TriggerArgument[] {
  const structured: TriggerArgument[] = [];
  runtimeArguments.forEach((arg) => {
    const value = formData[arg.name];

    // Booleans render as a single checkbox regardless of `repeat`, so handle them here
    // before the repeat-array path (which would otherwise silently drop the value).
    if (arg.type === 'boolean') {
      if (value === true || value === 'true') {
        structured.push({ argument_name: arg.name, argument_value: arg.prefix ? arg.prefix : 'true' });
      }
      return;
    }

    if (!arg.repeat) {
      // Blank counts as empty, as it does for validation.
      if (value === undefined || value === null || String(value).trim() === '') return;
      pushArgument(structured, arg, String(value));
      return;
    }

    const values = Array.isArray(value) ? value.filter((item) => item && String(item).trim() !== '') : [];
    values.forEach((item) => pushArgument(structured, arg, String(item)));
  });
  return structured;
}

// saved run-pod arguments → form data (reverse of the above)
// Loads a past execution's (or a draft's) arguments back into the dynamic form.
// Mirrors Devant's parseArgumentsToFieldValues.

function groupByName(args: ExecutionArgument[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const arg of args) {
    (grouped[arg.argumentName] ??= []).push(arg.argumentValue);
  }
  return grouped;
}

function extractPrefixedValue(values: string[], prefix: string, delimiter?: string): string {
  if (delimiter) {
    const match = values.find((v) => v.startsWith(prefix));
    return match ? match.substring(prefix.length + delimiter.length) : '';
  }
  const idx = values.indexOf(prefix);
  return idx !== -1 && idx + 1 < values.length ? values[idx + 1] : '';
}

function extractRepeatValues(values: string[], prefix?: string, delimiter?: string): string[] {
  if (!prefix) return values.length > 0 ? values : [''];
  const result: string[] = [];
  if (delimiter) {
    for (const v of values) {
      if (v.startsWith(prefix)) {
        const extracted = v.substring(prefix.length + delimiter.length).trim();
        if (extracted) result.push(extracted);
      }
    }
  } else {
    for (let i = 0; i < values.length; i += 1) {
      if (values[i] === prefix && i + 1 < values.length) result.push(values[i + 1]);
    }
  }
  return result.length > 0 ? result : [''];
}

/** Reconstruct the dynamic-form state from saved run-pod arguments + the schema. */
export function parseArgumentsToFormData(savedArgs: ExecutionArgument[], schema: RuntimeArgument[]): DynamicFormData {
  const grouped = groupByName(savedArgs);
  const formData: DynamicFormData = {};
  for (const arg of schema) {
    const values = grouped[arg.name];
    if (!values || values.length === 0) continue;
    if (arg.repeat) {
      formData[arg.name] = extractRepeatValues(values, arg.prefix, arg.delimiter);
    } else if (arg.type === 'boolean') {
      formData[arg.name] = arg.prefix ? values.includes(arg.prefix) : values[0] === 'true';
    } else if (arg.prefix) {
      formData[arg.name] = extractPrefixedValue(values, arg.prefix, arg.delimiter);
    } else {
      formData[arg.name] = values[0] ?? '';
    }
  }
  return formData;
}

// dirty tracking (is the form different from a committed baseline?)

/** Drop blanks/empty entries so equality ignores untouched fields. Mirrors Devant. */
export function normalizeFormData(data: DynamicFormData): DynamicFormData {
  const normalized: DynamicFormData = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) normalized[key] = trimmed;
    } else if (Array.isArray(value)) {
      const items = value.filter((item) => item && item.trim());
      if (items.length > 0) normalized[key] = items;
    } else if (value) {
      // boolean: keep only when checked (true); unchecked reads as no input
      normalized[key] = value;
    }
  }
  return normalized;
}

function valuesEqual(a: DynamicFormFieldValue, b: DynamicFormFieldValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => item === b[i]);
  return a === b;
}

/** True when the two form states are equivalent after normalization. */
export function formDataEqual(a: DynamicFormData, b: DynamicFormData): boolean {
  const left = normalizeFormData(a);
  const right = normalizeFormData(b);
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => key in right && valuesEqual(left[key], right[key]));
}
