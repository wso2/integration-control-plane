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

import type { SpanCategory, TimelineSpan } from './workflowFlow';

/**
 * Reads a run's history events: the timeline is reconstructed from them, and a step's input, result
 * and failure are decoded from them. The engine's `/history` is a Temporal-shaped list, so the
 * parsing follows Temporal's event vocabulary.
 *
 * Each event carries a short-form `eventType` (WORKFLOW_EXECUTION_STARTED, ACTIVITY_TASK_SCHEDULED,
 * ...), an `eventId`, a time, and a type-specific `attributes` object. Durations are recovered by
 * pairing each lifecycle's events by their id references: activities by the SCHEDULED event's id
 * (echoed as `scheduledEventId`), timers by `timerId`, child workflows by the INITIATED event's id
 * (echoed as `initiatedEventId`). Anything left unpaired is still running, or, once the run has
 * ended, ended with it.
 *
 * Decoded payloads are returned as values, not pretty-printed strings: the console renders them with
 * `shared/StructuredValue`, which wants the value.
 */

export interface Timeline {
  spans: TimelineSpan[];
  start: number;
  end: number;
}

type EventRecord = Record<string, unknown>;

const asRecord = (value: unknown): EventRecord => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as EventRecord) : {});

const asStr = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' ? String(value) : undefined;
};

/** An epoch number of unknown unit (ms, µs or ns), as milliseconds. */
function numberToMs(n: number): number {
  if (n > 1e17) {
    return Math.round(n / 1e6);
  }
  if (n > 1e14) {
    return Math.round(n / 1e3);
  }
  return n;
}

/** An event's time as epoch milliseconds; the runtime's key for it varies, so several are tried. */
function eventTimeMs(event: EventRecord): number | null {
  const raw = event.eventTime ?? event.timestamp ?? event.eventTimestamp ?? event.time;
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'number') {
    return numberToMs(raw);
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    const num = Number(raw);
    return Number.isNaN(num) ? null : numberToMs(num);
  }
  return null;
}

const eventTypeOf = (event: EventRecord): string => (asStr(event.eventType) ?? '').replace(/^EVENT_TYPE_/, '').toUpperCase();

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
  // The child never started; this closes its INITIATED event all the same.
  START_CHILD_WORKFLOW_EXECUTION_FAILED: 'FAILED',
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
  attrs: EventRecord;
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
  parsed.forEach((p) => {
    if (p.time === null) {
      return;
    }
    if (p.type === openType) {
      const key = openKey(p);
      if (key) {
        groups.set(key, { ...make(p, p.time), eventId: p.id });
      }
    } else if (p.type in closeStatus) {
      const group = groups.get(closeKey(p));
      if (group) {
        group.end = p.time;
        group.status = closeStatus[p.type];
      }
    }
  });
  return groups;
}

/** `orderWorkflow.approveOrder` (optionally `workflow-`-prefixed) into its workflow and task parts. */
export function splitQualifiedName(name?: string): {
  workflow?: string;
  task?: string;
} {
  if (!name) {
    return {};
  }
  const clean = name.replace(/^workflow-/, '');
  const idx = clean.indexOf('.');
  if (idx <= 0) {
    return { task: clean };
  }
  return { workflow: clean.slice(0, idx), task: clean.slice(idx + 1) };
}

/** A review runs as a child workflow named after the activity it gates, prefixed `reviewactivity-`. */
function reviewSpanLabel(bareName: string): string {
  const { workflow, task } = splitQualifiedName(bareName);
  if (!task) {
    return bareName || 'Review';
  }
  return workflow ? `${workflow}.review-${task}` : `review-${task}`;
}

function parseEvents(events: ReadonlyArray<unknown>): ParsedEvent[] {
  return events.map((raw, i) => {
    const event = asRecord(raw);
    return {
      id: asStr(event.eventId) ?? String(i),
      type: eventTypeOf(event),
      time: eventTimeMs(event),
      attrs: asRecord(event.attributes),
    };
  });
}

/** Reconstructs the run's spans (the Gantt timeline) from its history events. */
export function buildTimeline(events: ReadonlyArray<unknown>): Timeline {
  const parsed = parseEvents(events);
  const times = parsed.map((p) => p.time).filter((t): t is number => t !== null);
  if (times.length === 0) {
    return { spans: [], start: 0, end: 0 };
  }
  const overallStart = Math.min(...times);
  const overallEnd = Math.max(...times);

  // Temporal writes no close event for a step still open when the run ends (terminated, timed
  // out), so such a step ends with the run, and as the run ended, rather than running forever.
  const terminal = [...parsed].reverse().find((p) => p.type in WF_TERMINAL_STATUS);
  const spans: TimelineSpan[] = [];
  const pushGroup = (key: string, group: Group) => {
    const open = group.end === undefined;
    const running = open && !terminal;
    let status = group.status ?? 'COMPLETED';
    if (running) {
      status = 'RUNNING';
    } else if (open && terminal) {
      status = WF_TERMINAL_STATUS[terminal.type];
    }
    spans.push({
      key,
      eventId: group.eventId,
      label: group.label,
      category: group.category,
      status,
      start: group.start,
      end: group.end ?? terminal?.time ?? overallEnd,
      running,
    });
  };

  // The run itself: started, to its terminal event or, while there is none, still running.
  const startEvent = parsed.find((p) => p.type === 'WORKFLOW_EXECUTION_STARTED');
  if (startEvent) {
    pushGroup('workflow', {
      eventId: startEvent.id,
      label: asStr(asRecord(startEvent.attrs.workflowType).name) ?? 'Workflow',
      category: 'WORKFLOW',
      start: startEvent.time ?? overallStart,
      end: terminal?.time ?? undefined,
      status: terminal ? WF_TERMINAL_STATUS[terminal.type] : undefined,
    });
  }

  // Activities, keyed by the SCHEDULED event id. A human task surfaces as an activity named `humantask-...`.
  collectDurationGroups(
    parsed,
    'ACTIVITY_TASK_SCHEDULED',
    ACTIVITY_CLOSE_STATUS,
    (p) => p.id,
    (p) => asStr(p.attrs.scheduledEventId) ?? '',
    (p, time) => {
      const name = asStr(asRecord(p.attrs.activityType).name) ?? asStr(p.attrs.activityId) ?? 'Activity';
      return {
        label: name,
        category: /humantask/i.test(name) ? 'HUMAN_TASK' : 'ACTIVITY',
        start: time,
      };
    },
  ).forEach((group, id) => pushGroup(`act-${id}`, group));

  // Timers, keyed by the timer id both their start and their close carry.
  const timerId = (p: ParsedEvent) => asStr(p.attrs.timerId) ?? '';
  collectDurationGroups(parsed, 'TIMER_STARTED', TIMER_CLOSE_STATUS, timerId, timerId, (p, time) => ({
    label: `Timer ${timerId(p)}`,
    category: 'TIMER',
    start: time,
  })).forEach((group, id) => pushGroup(`timer-${id}`, group));

  // Child workflows, keyed by the INITIATED event id. A review is a child workflow prefixed
  // `reviewactivity-`, and reads as the human task it is.
  collectDurationGroups(
    parsed,
    'START_CHILD_WORKFLOW_EXECUTION_INITIATED',
    CHILD_CLOSE_STATUS,
    (p) => p.id,
    (p) => asStr(p.attrs.initiatedEventId) ?? '',
    (p, time) => {
      const wfName = asStr(asRecord(p.attrs.workflowType).name) ?? '';
      const wfId = asStr(p.attrs.workflowId) ?? '';
      const isReview = /^reviewactivity-/i.test(wfId) || /^reviewactivity-/i.test(wfName);
      const bare = (wfName || wfId || 'Child Workflow').replace(/^reviewactivity-/i, '');
      return {
        label: isReview ? reviewSpanLabel(bare) : bare,
        category: isReview ? 'HUMAN_TASK' : 'CHILD_WORKFLOW',
        start: time,
      };
    },
  ).forEach((group, id) => pushGroup(`child-${id}`, group));

  // Signals are instants: start === end, drawn as a marker rather than a bar.
  parsed.forEach((p) => {
    if (p.time === null || p.type !== 'WORKFLOW_EXECUTION_SIGNALED') {
      return;
    }
    spans.push({
      key: `signal-${p.id}`,
      eventId: p.id,
      label: asStr(p.attrs.signalName) ?? 'Signal',
      category: 'SIGNAL',
      status: '',
      start: p.time,
      end: p.time,
      running: false,
    });
  });

  // The run first, then by start time, so the lanes read top to bottom in execution order.
  const rootFirst = (s: TimelineSpan) => (s.category === 'WORKFLOW' ? -1 : 0);
  spans.sort((a, b) => rootFirst(a) - rootFirst(b) || a.start - b.start || a.end - b.end);

  return { spans, start: overallStart, end: overallEnd };
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

interface Payload {
  data?: unknown;
  metadata?: { encoding?: unknown };
}

/** One payload's base64 `data`, parsed when its encoding says JSON. */
function decodePayload(payload: Payload): unknown {
  if (typeof payload?.data !== 'string') {
    return payload?.data === undefined ? null : payload.data;
  }
  try {
    const text = base64ToUtf8(payload.data);
    const encoding = typeof payload?.metadata?.encoding === 'string' ? base64ToUtf8(payload.metadata.encoding) : '';
    if (encoding.includes('json')) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    // `binary/null` is how a void result is encoded.
    if (encoding.includes('null')) {
      return null;
    }
    return text;
  } catch {
    return payload;
  }
}

/** A `{ payloads: [...] }` container as one value, or an array of them; null when it holds none. */
export function decodePayloads(container: unknown): unknown {
  const { payloads } = asRecord(container);
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return null;
  }
  const decoded = payloads.map((p) => decodePayload(p as Payload));
  return decoded.length === 1 ? decoded[0] : decoded;
}

/** The run's start input, from its WORKFLOW_EXECUTION_STARTED event; null when none was recorded. */
export function extractWorkflowInput(events: ReadonlyArray<unknown>): unknown {
  const started = events.map(asRecord).find((e) => eventTypeOf(e) === 'WORKFLOW_EXECUTION_STARTED');
  return started ? decodePayloads(asRecord(started.attributes).input) : null;
}

export interface NodeExecutionDetail {
  /** The decoded input, or null when none was recorded. */
  input: unknown;
  /** The decoded result, or null when none was recorded or the step has not finished. */
  result: unknown;
  /** Upper-case status from the close event, falling back to the node's own. */
  status?: string;
  error: string | null;
  durationMs: number | null;
  startTimeMs: number | null;
  endTimeMs: number | null;
  /** The module's call configuration, split off the input's last element. */
  callConfig: Record<string, unknown> | null;
  childWorkflowId: string | null;
}

const statusFromCloseType = (type: string): string => ACTIVITY_CLOSE_STATUS[type] ?? CHILD_CLOSE_STATUS[type] ?? WF_TERMINAL_STATUS[type] ?? type;

/** The key the module marks its call-configuration envelope with. */
const CALL_CONFIG_MARKER = '__callConfig__';

const isCallConfig = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && (value as EventRecord)[CALL_CONFIG_MARKER] === true;

const withoutMarker = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== CALL_CONFIG_MARKER));

/**
 * One step's input, result, status and timing. `node.id` is the id of the event that opened it
 * (ACTIVITY_TASK_SCHEDULED for an activity, START_CHILD_WORKFLOW_EXECUTION_INITIATED for a child
 * workflow or human task, WORKFLOW_EXECUTION_STARTED for the run), and its close event echoes that
 * id as `scheduledEventId` or `initiatedEventId`.
 */
export function extractNodeExecutionDetail(node: { id: string; type: string; status?: string }, events: ReadonlyArray<unknown>): NodeExecutionDetail {
  const records = events.map(asRecord);
  const nodeType = (node.type ?? '').toUpperCase();
  let open = records.find((e) => asStr(e.eventId) === node.id);
  if (!open && nodeType === 'WORKFLOW') {
    open = records.find((e) => eventTypeOf(e) === 'WORKFLOW_EXECUTION_STARTED');
  }
  let input: unknown = open ? decodePayloads(asRecord(open.attributes).input) : null;
  const childWorkflowId = open && eventTypeOf(open) === 'START_CHILD_WORKFLOW_EXECUTION_INITIATED' ? (asStr(asRecord(open.attributes).workflowId) ?? null) : null;

  // The module appends its call configuration as the input's last element, marked __callConfig__.
  let callConfig: Record<string, unknown> | null = null;
  if (isCallConfig(input)) {
    // A call with no arguments decodes to the envelope alone.
    callConfig = withoutMarker(input);
    input = null;
  } else if (Array.isArray(input) && input.length > 0) {
    const last = input[input.length - 1];
    if (isCallConfig(last)) {
      callConfig = withoutMarker(last);
      const args = input.slice(0, -1);
      if (args.length === 0) {
        input = null;
      } else {
        input = args.length === 1 ? args[0] : args;
      }
    }
  }

  const isCloseType = (type: string) => type in ACTIVITY_CLOSE_STATUS || type in CHILD_CLOSE_STATUS;
  const close =
    nodeType === 'WORKFLOW'
      ? [...records].reverse().find((e) => eventTypeOf(e) in WF_TERMINAL_STATUS)
      : records.find((e) => {
          if (!isCloseType(eventTypeOf(e))) {
            return false;
          }
          const attrs = asRecord(e.attributes);
          return asStr(attrs.scheduledEventId) === node.id || asStr(attrs.initiatedEventId) === node.id;
        });

  let result: unknown = null;
  let error: string | null = null;
  if (close) {
    const attrs = asRecord(close.attributes);
    result = decodePayloads(attrs.result);
    error = asStr(asRecord(attrs.failure).message) ?? null;
  }

  const startTimeMs = open ? eventTimeMs(open) : null;
  const endTimeMs = close ? eventTimeMs(close) : null;

  return {
    input,
    result,
    status: close ? statusFromCloseType(eventTypeOf(close)) : node.status,
    error,
    durationMs: startTimeMs !== null && endTimeMs !== null ? endTimeMs - startTimeMs : null,
    startTimeMs,
    endTimeMs,
    callConfig,
    childWorkflowId,
  };
}
