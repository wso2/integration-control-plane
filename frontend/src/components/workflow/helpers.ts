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

// Pure helpers for the workflow feature. Kept separate from the component module
// (shared.tsx) so React Fast Refresh works and concerns stay separated.

import { targetForTaskQueue, type InstanceGraph, type WorkflowTarget } from '../../api/workflows';
import { formatDateTime } from '../../utils/time';

// ── Portal scope ──
//
// A project shares one Temporal engine: every runtime in it is bound to the same namespace and
// differs only by task queue. So one runtime answers for the whole project, and a listing is
// narrowed by `taskQueue` rather than by which runtime is called. Shared by both portals.

export interface PortalScope {
  // Every integration in view: the read gateway is the first, and rows route back by task queue.
  targets: WorkflowTarget[];
  environmentId: string;
  // Integration scope: that integration's task queue. Project scope: undefined (whole namespace).
  taskQueue?: string;
}

// Structurally a `WorkflowScope`; spelled out here to keep this module free of component imports.
type TargetScope = { componentId: string; environmentId: string };

// The runtime every read goes through — any runtime in the project serves the whole namespace.
export const gatewayScope = (scope: PortalScope): TargetScope => ({ componentId: scope.targets[0]?.componentId ?? '', environmentId: scope.environmentId });

// Scope for acting on one row: the integration whose task queue owns it, falling back to the gateway when the
// task queue is absent or is not one of this project's integrations.
export function ownerScope(scope: PortalScope, taskQueue?: string): TargetScope {
  const owner = targetForTaskQueue(scope.targets, taskQueue);
  return owner ? { componentId: owner.componentId, environmentId: scope.environmentId } : gatewayScope(scope);
}

// How a row's owning integration is labelled: its display name when known, else the raw task queue.
export const ownerLabel = (scope: PortalScope, taskQueue?: string): string => targetForTaskQueue(scope.targets, taskQueue)?.componentName ?? taskQueue ?? '—';

// Pretty-prints any value as JSON for display; returns '' for nullish.
export function jsonPretty(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// Reverses the ICP proxy's role-name escaping for display (`%2C` → `,`).
export function unescapeRoleName(role: string): string {
  return role.replace(/%2C/gi, ',');
}

// Shared heading style for workflow cards, sections, and form/dialog titles: bold, muted gray.
export const sectionTitleSx = { fontWeight: 700, color: 'text.secondary' } as const;

// Oxygen chip/palette colour names used to convey workflow & task status.
export type ChipColor = 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info';

// Maps a normalized (upper-case) workflow/task status to an Oxygen chip/palette colour.
export const STATUS_COLORS: Record<string, ChipColor> = {
  RUNNING: 'info',
  COMPLETED: 'success',
  FAILED: 'error',
  TERMINATED: 'error',
  CANCELED: 'warning',
  CANCELLED: 'warning',
  TIMED_OUT: 'warning',
  CONTINUED_AS_NEW: 'default',
  SUSPENDED: 'warning',
  PENDING: 'info',
};

export const modelStepId = (activity: string): string => `model#${activity}`;
export const modelStepActivity = (stepId: string): string | null => (stepId.startsWith('model#') ? stepId.slice('model#'.length) : null);

export function displayWorkflowId(id?: string): string {
  if (!id) return '—';
  return id.replace(/^(workflow|humantask|childwf|childagent|reviewactivity)-/i, '');
}

// Splits a qualified task/activity name like `placeOrderWorkflow.approveOrder` (optionally prefixed `workflow-`)
// into its workflow and task parts. Names without a qualifier map to `{ task: name }`.
export function splitQualifiedName(name?: string): { workflow?: string; task?: string } {
  if (!name) return {};
  const clean = name.replace(/^workflow-/, '');
  const idx = clean.indexOf('.');
  if (idx <= 0) return { task: clean };
  return { workflow: clean.slice(0, idx), task: clean.slice(idx + 1) };
}

// Converts a key like `orderId` or `error_code` to a display label like `Order Id`.
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// A form field derived from a JSON schema property. Object properties that themselves declare `properties`
// become groups (`fields` set, rendered as a nested set of inputs) rather than a single JSON textarea.
export interface FormField {
  name: string;
  type: string;
  label: string;
  required: boolean;
  description?: string;
  enumValues?: string[];
  fields?: FormField[];
}

// Joins a parent path and a field name into the dotted key used for a leaf field's value.
export const fieldPath = (prefix: string, name: string): string => (prefix ? `${prefix}.${name}` : name);

// `type` may be a string, an array (`["string","null"]`) or absent; an enum may arrive as `anyOf`/`oneOf` of `const`.
function normalizeLeafSchema(d: Record<string, unknown>): { type: string; enumValues?: string[] } {
  let type: string | undefined;
  if (typeof d.type === 'string') type = d.type;
  else if (Array.isArray(d.type)) type = d.type.find((t): t is string => typeof t === 'string' && t !== 'null');

  const rawEnum = Array.isArray(d.enum) ? d.enum.filter((v) => v !== null) : [];
  let enumValues = rawEnum.length > 0 ? rawEnum.map(String) : undefined;
  let enumSamples: unknown[] = rawEnum;
  if (!enumValues) {
    const variants = Array.isArray(d.anyOf) ? d.anyOf : Array.isArray(d.oneOf) ? d.oneOf : null;
    if (variants) {
      const collected: unknown[] = [];
      let allLiteral = true;
      for (const v of variants) {
        const vo = v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
        if (vo.const !== undefined) collected.push(vo.const);
        else if (Array.isArray(vo.enum)) collected.push(...vo.enum.filter((e) => e !== null));
        else if (vo.type === 'null') continue;
        else {
          allLiteral = false;
          break;
        }
      }
      if (allLiteral && collected.length > 0) {
        enumValues = collected.map(String);
        enumSamples = collected;
      }
    }
  }
  if (!type && enumSamples.length > 0) {
    type = enumSamples.every((v) => typeof v === 'number') ? (enumSamples.every((v) => Number.isInteger(v)) ? 'integer' : 'number') : enumSamples.every((v) => typeof v === 'boolean') ? 'boolean' : 'string';
  }
  if (!type) type = d.properties ? 'object' : 'string';
  return { type, ...(enumValues ? { enumValues } : {}) };
}

// Parses a JSON-schema object (already-parsed) into a field list, recursing into nested objects.
function parseObjectSchema(s: unknown): FormField[] | null {
  if (s === null || typeof s !== 'object' || Array.isArray(s)) return null;
  const obj = s as Record<string, unknown>;
  const props = obj.properties;
  if (props === null || typeof props !== 'object' || Array.isArray(props)) return null;
  const required = new Set(Array.isArray(obj.required) ? obj.required.filter((r): r is string => typeof r === 'string') : []);
  const fields = Object.entries(props as Record<string, unknown>).map(([name, def]): FormField => {
    const d = (def !== null && typeof def === 'object' ? def : {}) as Record<string, unknown>;
    const { type, enumValues } = normalizeLeafSchema(d);
    // An object with its own properties becomes a group; a freeform object stays a JSON textarea.
    const nested = type === 'object' ? parseObjectSchema(d) : null;
    return {
      name,
      type,
      label: typeof d.title === 'string' ? d.title : humanizeKey(name),
      required: required.has(name),
      description: typeof d.description === 'string' ? d.description : undefined,
      enumValues,
      ...(nested ? { fields: nested } : {}),
    };
  });
  return fields.length > 0 ? fields : null;
}

// Parses a JSON schema (an object, or a JSON string of one) into a field list for form rendering. Nested object
// schemas are expanded into nested field groups.
export function parseFormSchema(schema: unknown): FormField[] | null {
  let s: unknown = schema;
  if (typeof s === 'string') {
    try {
      s = JSON.parse(s);
    } catch {
      return null;
    }
  }
  return parseObjectSchema(s);
}

// Coerces one leaf field's entered value to its schema type, recording any error by dotted path.
function coerceLeaf(f: FormField, path: string, values: Record<string, string | boolean>, result: Record<string, unknown>, errors: Record<string, string>): void {
  if (f.type === 'boolean') {
    const v = values[path];
    if (typeof v === 'boolean') result[f.name] = v;
    else if (f.required) errors[path] = `${f.label} is required.`;
    return;
  }
  const raw = values[path];
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    if (f.required) errors[path] = `${f.label} is required.`;
    return;
  }
  if (f.type === 'number' || f.type === 'integer') {
    const n = Number(text);
    if (Number.isNaN(n) || (f.type === 'integer' && !Number.isInteger(n))) {
      errors[path] = f.type === 'integer' ? `${f.label} must be an integer.` : `${f.label} must be a number.`;
      return;
    }
    result[f.name] = n;
  } else if (f.type === 'object' || f.type === 'array') {
    try {
      result[f.name] = JSON.parse(text);
    } catch {
      errors[path] = `${f.label} must be valid JSON.`;
    }
  } else {
    result[f.name] = text;
  }
}

// True when any leaf under `fields` has a value entered (a boolean choice, or non-blank text).
function hasAnyValue(fields: FormField[], values: Record<string, string | boolean>, prefix: string): boolean {
  return fields.some((f) => {
    const path = fieldPath(prefix, f.name);
    if (f.fields) return hasAnyValue(f.fields, values, path);
    const v = values[path];
    return typeof v === 'boolean' || (typeof v === 'string' && v.trim() !== '');
  });
}

function buildLevel(fields: FormField[], values: Record<string, string | boolean>, prefix: string, errors: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const f of fields) {
    const path = fieldPath(prefix, f.name);
    if (f.fields) {
      // A nested object's own `required` list only applies when that object is present. So an optional
      // group left entirely blank is omitted rather than walked — otherwise its children each report
      // "is required", which reads as a validation failure for input the schema never asked for.
      if (!f.required && !hasAnyValue(f.fields, values, path)) continue;
      result[f.name] = buildLevel(f.fields, values, path, errors);
    } else {
      coerceLeaf(f, path, values, result, errors);
    }
  }
  return result;
}

// Validates generated-form values against their fields and coerces them to schema types, rebuilding nested
// objects for grouped fields.
export function buildFormResult(fields: FormField[], values: Record<string, string | boolean>): { result: Record<string, unknown>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const result = buildLevel(fields, values, '', errors);
  return { result, errors };
}

function fillValues(fields: FormField[], source: Record<string, unknown>, prefix: string, values: Record<string, string | boolean>): void {
  for (const f of fields) {
    const path = fieldPath(prefix, f.name);
    const v = source[f.name];
    if (f.fields) {
      fillValues(f.fields, v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}, path, values);
      continue;
    }
    if (v === undefined || v === null) continue;
    if (f.type === 'boolean') {
      if (typeof v === 'boolean') values[path] = v;
    } else if (f.type === 'object' || f.type === 'array') {
      values[path] = typeof v === 'string' ? v : jsonPretty(v);
    } else {
      values[path] = typeof v === 'string' ? v : String(v);
    }
  }
}

// Builds generated-form values (the shape `SchemaFormFields` expects, keyed by dotted path) from a source object
// — the inverse of `buildFormResult`.
export function formValuesFromObject(fields: FormField[], source: Record<string, unknown>): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  fillValues(fields, source, '', values);
  return values;
}

export interface FieldChange {
  path: string;
  label: string;
  from: string;
  to: string;
}

export function diffFormValues(fields: FormField[], original: Record<string, string | boolean>, current: Record<string, string | boolean>): FieldChange[] {
  const changes: FieldChange[] = [];
  const asText = (v: string | boolean | undefined): string => (v === undefined ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v);
  const walk = (fs: FormField[], prefix: string, labelPrefix: string) => {
    for (const f of fs) {
      const path = fieldPath(prefix, f.name);
      const label = labelPrefix ? `${labelPrefix} › ${f.label}` : f.label;
      if (f.fields) {
        walk(f.fields, path, label);
        continue;
      }
      const from = asText(original[path]);
      const to = asText(current[path]);
      if (from !== to) changes.push({ path, label, from: from || '—', to: to || '—' });
    }
  };
  walk(fields, '', '');
  return changes;
}

// Returns a copy of `items` sorted by their `startTime`, newest first (missing/invalid times last).
export function sortByStartTimeDesc<T extends { startTime?: string }>(items: T[]): T[] {
  const ts = (v?: string) => {
    const t = v ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  return [...items].sort((a, b) => ts(b.startTime) - ts(a.startTime));
}

// Formats an ISO-8601 timestamp for compact display; passes through on failure.
export function formatTime(value?: string): string {
  return formatDateTime(value);
}

// Formats a millisecond duration compactly: `840ms`, `4.2s`, `1m 8s`, `2h 5m`.
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const totalSec = Math.round(s);
  const m = Math.floor(totalSec / 60);
  if (m < 60) {
    const rem = totalSec % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

// Formats a duration as a stopwatch that always shows seconds: `0:04`, `1:08`, `1:05:08`.
export function formatStopwatch(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ── Timeline reconstruction from workflow history events ──
//
// History events are Temporal-shaped (see extractWorkflowInput): each carries a short-form
// `eventType` (e.g. WORKFLOW_EXECUTION_STARTED, ACTIVITY_TASK_SCHEDULED), an `eventId`, an event
// time, and a generic `attributes` object holding the type-specific fields. The runtime's exact
// timestamp key can vary, so parsing tries several. Duration bars are reconstructed by pairing each
// lifecycle group by its id references: activities by the SCHEDULED event's id (echoed as
// `scheduledEventId` on later events), timers by `timerId`, child workflows by the INITIATED event's
// id (echoed as `initiatedEventId`). Anything that can't be paired still renders as an open bar
// running to the last known event.

export type SpanCategory = 'WORKFLOW' | 'ACTIVITY' | 'HUMAN_TASK' | 'TIMER' | 'CHILD_WORKFLOW' | 'SIGNAL';

// ── The agent's vocabulary ──

export const MODEL_ACTIVITY_LABELS: Record<string, string> = {
  llmChat: 'Thinking',
  generate: 'Generate',
  generateResult: 'Generate Result',
};

// The wrapper activity an AI-function tool runs inside; its lane is named by the tool, not by it.
const EXECUTE_AGENT_TOOL = 'executeAgentTool';

function wrappedToolName(attrs: Record<string, unknown>): string | null {
  const input = decodePayloads(attrs['input']);
  const first = Array.isArray(input) ? input[0] : input;
  if (first === null || typeof first !== 'object') return null;
  const toolName = (first as Record<string, unknown>)['toolName'];
  return typeof toolName === 'string' ? toolName : null;
}

export interface TimelineSpan {
  key: string;
  // Id of the event that opened the span — the join key to a step's eventIds.
  eventId?: string;
  label: string;
  category: SpanCategory;
  // Normalized upper-case status (COMPLETED, FAILED, RUNNING, …), shared with StatusChip colours.
  status: string;
  // Epoch milliseconds.
  start: number;
  end: number;
  running: boolean;
}

export interface Timeline {
  spans: TimelineSpan[];
  start: number;
  end: number;
}

const asRecord = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const asStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);

// Normalizes an epoch number of unknown unit (ms/µs/ns) to milliseconds using magnitude heuristics.
function numberToMs(n: number): number {
  if (n > 1e17) return Math.round(n / 1e6); // nanoseconds
  if (n > 1e14) return Math.round(n / 1e3); // microseconds
  return n; // already milliseconds
}

// Reads an event's timestamp (trying common key names / formats) as epoch milliseconds, or null.
function eventTimeMs(e: Record<string, unknown>): number | null {
  const raw = e['eventTime'] ?? e['timestamp'] ?? e['eventTimestamp'] ?? e['time'];
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return numberToMs(raw);
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
    const num = Number(raw);
    return Number.isNaN(num) ? null : numberToMs(num);
  }
  return null;
}

const WF_TERMINAL_STATUS: Record<string, string> = {
  WORKFLOW_EXECUTION_COMPLETED: 'COMPLETED',
  WORKFLOW_EXECUTION_FAILED: 'FAILED',
  WORKFLOW_EXECUTION_TIMED_OUT: 'TIMED_OUT',
  WORKFLOW_EXECUTION_CANCELED: 'CANCELED',
  WORKFLOW_EXECUTION_TERMINATED: 'TERMINATED',
  WORKFLOW_EXECUTION_CONTINUED_AS_NEW: 'CONTINUED_AS_NEW',
};

const ACTIVITY_CLOSE_STATUS: Record<string, string> = {
  ACTIVITY_TASK_COMPLETED: 'COMPLETED',
  ACTIVITY_TASK_FAILED: 'FAILED',
  ACTIVITY_TASK_TIMED_OUT: 'TIMED_OUT',
  ACTIVITY_TASK_CANCELED: 'CANCELED',
};

const CHILD_CLOSE_STATUS: Record<string, string> = {
  CHILD_WORKFLOW_EXECUTION_COMPLETED: 'COMPLETED',
  CHILD_WORKFLOW_EXECUTION_FAILED: 'FAILED',
  CHILD_WORKFLOW_EXECUTION_TIMED_OUT: 'TIMED_OUT',
  CHILD_WORKFLOW_EXECUTION_CANCELED: 'CANCELED',
  CHILD_WORKFLOW_EXECUTION_TERMINATED: 'TERMINATED',
};

const TIMER_CLOSE_STATUS: Record<string, string> = {
  TIMER_FIRED: 'COMPLETED',
  TIMER_CANCELED: 'CANCELED',
};

interface ParsedEvent {
  id: string;
  type: string;
  time: number | null;
  attrs: Record<string, unknown>;
}

interface Group {
  label: string;
  category: SpanCategory;
  start: number;
  end?: number;
  status?: string;
  eventId?: string;
}

function collectDurationGroups(parsed: ParsedEvent[], openType: string, closeStatus: Record<string, string>, openKey: (p: ParsedEvent) => string, closeKey: (p: ParsedEvent) => string, make: (p: ParsedEvent, time: number) => Group): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const p of parsed) {
    if (p.time === null) continue;
    if (p.type === openType) {
      const key = openKey(p);
      if (key) groups.set(key, { ...make(p, p.time), eventId: p.id });
    } else if (p.type in closeStatus) {
      const g = groups.get(closeKey(p));
      if (g) {
        g.end = p.time;
        g.status = closeStatus[p.type];
      }
    }
  }
  return groups;
}

// A review runs as a child workflow whose type is the gated activity's qualified name prefixed `reviewactivity-`.
function reviewSpanLabel(bareName: string): string {
  const { workflow, task } = splitQualifiedName(bareName);
  if (!task) return bareName || 'Review';
  return workflow ? `${workflow}.review-${task}` : `review-${task}`;
}

// Reconstructs a set of duration spans (a Gantt timeline) from a workflow's history events.
export function buildTimeline(events: ReadonlyArray<Record<string, unknown>>): Timeline {
  const parsed: ParsedEvent[] = events.map((e, i) => ({
    id: asStr(e['eventId']) ?? String(i),
    type: (asStr(e['eventType']) ?? '').replace(/^EVENT_TYPE_/, '').toUpperCase(),
    time: eventTimeMs(e),
    attrs: asRecord(e['attributes']),
  }));

  const times = parsed.map((p) => p.time).filter((t): t is number => t !== null);
  if (times.length === 0) return { spans: [], start: 0, end: 0 };
  const overallStart = Math.min(...times);
  const overallEnd = Math.max(...times);

  const spans: TimelineSpan[] = [];
  const pushGroup = (key: string, g: Group) => {
    const running = g.end === undefined;
    spans.push({ key, eventId: g.eventId, label: g.label, category: g.category, status: running ? 'RUNNING' : (g.status ?? 'COMPLETED'), start: g.start, end: g.end ?? overallEnd, running });
  };

  // Root workflow span: started → terminal event (or still running to the last event).
  const startEv = parsed.find((p) => p.type === 'WORKFLOW_EXECUTION_STARTED');
  if (startEv) {
    const terminal = [...parsed].reverse().find((p) => p.type in WF_TERMINAL_STATUS);
    pushGroup('workflow', {
      eventId: startEv.id,
      label: asStr(asRecord(startEv.attrs['workflowType'])['name']) ?? 'Workflow',
      category: 'WORKFLOW',
      start: startEv.time ?? overallStart,
      end: terminal?.time ?? undefined,
      status: terminal ? WF_TERMINAL_STATUS[terminal.type] : undefined,
    });
  }

  // Activities (human tasks surface as activities named `humantask-…`), keyed by the SCHEDULED event id.
  const activities = collectDurationGroups(
    parsed,
    'ACTIVITY_TASK_SCHEDULED',
    ACTIVITY_CLOSE_STATUS,
    (p) => p.id,
    (p) => asStr(p.attrs['scheduledEventId']) ?? '',
    (p, time) => {
      const name = asStr(asRecord(p.attrs['activityType'])['name']) ?? asStr(p.attrs['activityId']) ?? 'Activity';
      let label = MODEL_ACTIVITY_LABELS[name] ?? name;
      if (name === EXECUTE_AGENT_TOOL) label = wrappedToolName(p.attrs) ?? name;
      return { label, category: /humantask/i.test(name) ? 'HUMAN_TASK' : 'ACTIVITY', start: time };
    },
  );
  activities.forEach((g, id) => pushGroup(`act-${id}`, g));

  // Timers, keyed by timerId (present on both the started and fired/canceled events).
  const timerId = (p: ParsedEvent) => asStr(p.attrs['timerId']) ?? '';
  const timers = collectDurationGroups(parsed, 'TIMER_STARTED', TIMER_CLOSE_STATUS, timerId, timerId, (p, time) => ({ label: `Timer ${timerId(p)}`, category: 'TIMER', start: time }));
  timers.forEach((g, id) => pushGroup(`timer-${id}`, g));

  // Child workflows, keyed by the INITIATED event id. Review activities are human-in-the-loop steps
  // run as child workflows whose id/type is prefixed `reviewactivity-`; show them as human tasks.
  const children = collectDurationGroups(
    parsed,
    'START_CHILD_WORKFLOW_EXECUTION_INITIATED',
    CHILD_CLOSE_STATUS,
    (p) => p.id,
    (p) => asStr(p.attrs['initiatedEventId']) ?? '',
    (p, time) => {
      const wfName = asStr(asRecord(p.attrs['workflowType'])['name']) ?? '';
      const wfId = asStr(p.attrs['workflowId']) ?? '';
      const isReview = /^reviewactivity-/i.test(wfId) || /^reviewactivity-/i.test(wfName);
      const bare = (wfName || wfId || 'Child Workflow').replace(/^reviewactivity-/i, '');
      return { label: isReview ? reviewSpanLabel(bare) : bare, category: isReview ? 'HUMAN_TASK' : 'CHILD_WORKFLOW', start: time };
    },
  );
  children.forEach((g, id) => pushGroup(`child-${id}`, g));

  // Signals are point-in-time events (no duration): start === end, rendered as a marker.
  for (const p of parsed) {
    if (p.time === null || p.type !== 'WORKFLOW_EXECUTION_SIGNALED') continue;
    spans.push({ key: `signal-${p.id}`, eventId: p.id, label: asStr(p.attrs['signalName']) ?? 'Signal', category: 'SIGNAL', status: '', start: p.time, end: p.time, running: false });
  }

  // Workflow first, then by start time so bars read top-to-bottom in execution order.
  spans.sort((a, b) => (a.category === 'WORKFLOW' ? -1 : 0) - (b.category === 'WORKFLOW' ? -1 : 0) || a.start - b.start || a.end - b.end);

  return { spans, start: overallStart, end: overallEnd };
}

// Decodes a base64 string to UTF-8 text (handles multi-byte characters).
function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// One Temporal payload: base64 `data` with a base64 `metadata.encoding` describing its type.
interface Payload {
  data?: unknown;
  metadata?: { encoding?: unknown };
}

// Decodes one payload's base64 `data`, parsing `json/plain` payloads into objects.
function decodePayload(p: Payload): unknown {
  if (typeof p?.data !== 'string') return p?.data === undefined ? null : p.data;
  try {
    const text = base64ToUtf8(p.data);
    const encoding = typeof p?.metadata?.encoding === 'string' ? base64ToUtf8(p.metadata.encoding) : '';
    if (encoding.includes('json')) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    // A `binary/null` payload (used for a void result) has no data and decodes to null.
    if (encoding.includes('null')) return null;
    return text;
  } catch {
    return p;
  }
}

// Decodes a Temporal payload container (`{ payloads: [...] }`) into a single value (one payload) or an array
// (many). Returns null when there are no payloads.
export function decodePayloads(container: unknown): unknown {
  const payloads = asRecord(container)['payloads'];
  if (!Array.isArray(payloads) || payloads.length === 0) return null;
  const decoded = payloads.map((p) => decodePayload(p as Payload));
  return decoded.length === 1 ? decoded[0] : decoded;
}

// Extracts the start input from a workflow history's WORKFLOW_EXECUTION_STARTED event.
export function extractWorkflowInput(events: ReadonlyArray<Record<string, unknown>>): string | null {
  const started = events.find((e) => e['eventType'] === 'WORKFLOW_EXECUTION_STARTED');
  if (!started) return null;
  const decoded = decodePayloads(asRecord(started['attributes'])['input']);
  return decoded === null ? null : jsonPretty(decoded);
}

// ── Execution-graph node → history mapping ──
//
// A graph node's `id` is the history `eventId` of the event that OPENED that step:
//   ACTIVITY      → ACTIVITY_TASK_SCHEDULED               (input in attributes.input)
//   HUMAN_TASK    → START_CHILD_WORKFLOW_EXECUTION_INITIATED (input in attributes.input)
//   WORKFLOW root → WORKFLOW_EXECUTION_STARTED
// The matching CLOSE event carries the result and echoes the open event's id — activities via
// `scheduledEventId`, child workflows / human tasks via `initiatedEventId`. From those two events we
// recover the step's input, result, final status and any failure message.

export interface NodeExecutionDetail {
  // Pretty-printed JSON of the step's input, or null when none was recorded.
  input: string | null;
  // Pretty-printed JSON of the step's result, or null when none/not finished.
  result: string | null;
  // Normalized upper-case status derived from the close event (falls back to the node's status).
  status?: string;
  // Failure message when the step failed, else null.
  error: string | null;
  // Wall-clock duration open→close in milliseconds, or null when the step hasn't closed / has no times.
  durationMs: number | null;
  // Epoch ms of the open (scheduled/initiated/started) event, or null.
  startTimeMs: number | null;
  // Epoch ms of the close event, or null when still running.
  endTimeMs: number | null;
  callConfig: Record<string, unknown> | null;
  childWorkflowId: string | null;
}

const eventTypeOf = (e: Record<string, unknown>): string => (asStr(e['eventType']) ?? '').replace(/^EVENT_TYPE_/, '').toUpperCase();

// Reduces a close-event type to a bare status token, e.g. ACTIVITY_TASK_COMPLETED → COMPLETED.
const statusFromCloseType = (type: string): string => type.replace(/^(ACTIVITY_TASK_|CHILD_WORKFLOW_EXECUTION_|WORKFLOW_EXECUTION_)/, '');

// Maps one execution-graph node to its input / result / status / duration by pairing the open event (eventId ===
// node.id) with its matching CLOSE event in the workflow history. `events` is the raw history array.
export function extractNodeExecutionDetail(node: { id: string; type: string; status?: string }, events: ReadonlyArray<Record<string, unknown>>): NodeExecutionDetail {
  const nodeType = (node.type ?? '').toUpperCase();
  let open = events.find((e) => asStr(e['eventId']) === node.id);
  if (!open && nodeType === 'WORKFLOW') open = events.find((e) => eventTypeOf(e) === 'WORKFLOW_EXECUTION_STARTED');
  let inputDecoded = open ? decodePayloads(asRecord(open['attributes'])['input']) : null;
  const childWorkflowId = open && eventTypeOf(open) === 'START_CHILD_WORKFLOW_EXECUTION_INITIATED' ? (asStr(asRecord(open['attributes'])['workflowId']) ?? null) : null;

  // The module appends its call configuration as the input's last element, marked __callConfig__.
  let callConfig: Record<string, unknown> | null = null;
  const isCallConfig = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) && (v as Record<string, unknown>)['__callConfig__'] === true;
  const stripMarker = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).filter(([k]) => k !== '__callConfig__'));
  if (isCallConfig(inputDecoded)) {
    // A call with no arguments decodes to the envelope alone.
    callConfig = stripMarker(inputDecoded);
    inputDecoded = null;
  } else if (Array.isArray(inputDecoded) && inputDecoded.length > 0) {
    const last = inputDecoded[inputDecoded.length - 1];
    if (isCallConfig(last)) {
      callConfig = stripMarker(last);
      const args = inputDecoded.slice(0, -1);
      inputDecoded = args.length === 0 ? null : args.length === 1 ? args[0] : args;
    }
  }

  const isCloseType = (t: string) => t in ACTIVITY_CLOSE_STATUS || t in CHILD_CLOSE_STATUS;
  const close =
    nodeType === 'WORKFLOW'
      ? [...events].reverse().find((e) => eventTypeOf(e) in WF_TERMINAL_STATUS)
      : events.find((e) => {
          if (!isCloseType(eventTypeOf(e))) return false;
          const a = asRecord(e['attributes']);
          return asStr(a['scheduledEventId']) === node.id || asStr(a['initiatedEventId']) === node.id;
        });

  let resultDecoded: unknown = null;
  let error: string | null = null;
  if (close) {
    const a = asRecord(close['attributes']);
    resultDecoded = decodePayloads(a['result']);
    const failure = asRecord(a['failure']);
    error = asStr(failure['message']) ?? null;
  }

  const startTimeMs = open ? eventTimeMs(open) : null;
  const endTimeMs = close ? eventTimeMs(close) : null;
  const durationMs = startTimeMs !== null && endTimeMs !== null ? endTimeMs - startTimeMs : null;

  return {
    input: inputDecoded === null ? null : jsonPretty(inputDecoded),
    result: resultDecoded === null ? null : jsonPretty(resultDecoded),
    status: close ? statusFromCloseType(eventTypeOf(close)) : node.status,
    error,
    durationMs,
    startTimeMs,
    endTimeMs,
    callConfig,
    childWorkflowId,
  };
}

// ── Model-call rendering ──

export interface ModelToolCall {
  name: string;
  args: string;
}

export interface ModelCallView {
  lastMessage: { role: string; text: string } | null;
  earlierCount: number;
  toolsOffered: number;
  assistantText: string | null;
  toolCalls: ModelToolCall[];
  structuredResult: boolean;
}

const parseJson = (text: string | null): unknown => {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export function parseModelCall(detail: NodeExecutionDetail): ModelCallView | null {
  if (detail.callConfig?.['stepId'] !== 'model') return null;

  const input = asRecord(parseJson(detail.input));
  const messages = Array.isArray(input['messages']) ? (input['messages'] as unknown[]) : [];
  const tools = Array.isArray(input['tools']) ? (input['tools'] as unknown[]) : [];
  let lastMessage: { role: string; text: string } | null = null;
  const last = asRecord(messages[messages.length - 1]);
  if (Object.keys(last).length > 0) {
    const content = last['content'];
    lastMessage = {
      role: asStr(last['role']) ?? 'message',
      text: typeof content === 'string' && content !== '' ? content : jsonPretty(last),
    };
  }

  const result = asRecord(parseJson(detail.result));
  const isChatTurn = result['role'] === 'assistant';
  const content = result['content'];
  const rawCalls = Array.isArray(result['toolCalls']) ? (result['toolCalls'] as unknown[]) : [];
  const toolCalls: ModelToolCall[] = rawCalls.flatMap((c) => {
    const call = asRecord(c);
    const name = asStr(call['name'] ?? call['toolName']);
    if (!name) return [];
    const args = call['arguments'] ?? call['args'];
    return [{ name, args: args === undefined || args === null ? '' : typeof args === 'string' ? args : JSON.stringify(args) }];
  });

  return {
    lastMessage,
    earlierCount: Math.max(0, messages.length - 1),
    toolsOffered: tools.length,
    assistantText: isChatTurn && typeof content === 'string' && content !== '' ? content : null,
    toolCalls,
    structuredResult: !isChatTurn && detail.result !== null,
  };
}

export function signalEventIds(events: ReadonlyArray<Record<string, unknown>>, name: string): Set<string> {
  const ids = new Set<string>();
  for (const e of events) {
    if (eventTypeOf(e) !== 'WORKFLOW_EXECUTION_SIGNALED') continue;
    if (asStr(asRecord(e['attributes'])['signalName']) === name) {
      const id = asStr(e['eventId']);
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function flowUnavailable(data: InstanceGraph | undefined): string | null {
  if (!data) return "The workflow's structure could not be loaded, so this run is shown as its history.";
  if (!data.graph) {
    return "This integration hasn't published the workflow's structure, so this run is shown as its history. Redeploy it with a current runtime to see the flow.";
  }
  if (data.stepIdsAvailable === false) {
    return 'This run could not be placed on the workflow’s structure, so it is shown as its history. Its steps carry no step ids — typically an integration built against an older workflow module.';
  }
  return null;
}
