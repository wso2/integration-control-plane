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

import { PROBE_TYPE, type HCProbe, type HttpHeader, type ProbeType, type WriteProbe } from '../types/healthChecks';

// Slider presets mirror Devant's HCSliderValuesForm marks.
export const THRESHOLD_MARKS = [1, 3, 5, 7, 10];
export const TIMING_MARKS = [5, 10, 15, 30, 60, 120, 180, 240, 300];
export const TIMEOUT_MARKS = [1, 5, 10, 15, 30, 60];

export const FAILURE = { min: 1, max: 10, marks: THRESHOLD_MARKS };
export const SUCCESS = { min: 1, max: 10, marks: THRESHOLD_MARKS };
export const INITIAL_DELAY = { min: TIMING_MARKS[0], max: 300, marks: TIMING_MARKS };
export const FREQUENCY = { min: TIMING_MARKS[2], max: 300, marks: TIMING_MARKS };
export const TIMEOUT = { min: TIMEOUT_MARKS[0], max: 60, marks: TIMEOUT_MARKS };

export const DEFAULT_PORT = 8080;

/** A probe is configured when it has a non-empty type. */
export function hasProbe(p: HCProbe | undefined | null): boolean {
  return !!p?.type;
}

// ── field validation (mirrors Devant's inputValidations) ──────────────────────

export const REQUIRED_ERROR = 'This field is required';

/** Port: required, digits only, at most 5 characters (Devant's `validatePort`). */
export function validatePort(val: string): string | undefined {
  const v = (val ?? '').trim();
  if (!v) return REQUIRED_ERROR;
  if (!/^[0-9]+$/.test(v) || v.length > 5) return 'Invalid port number';
  return undefined;
}

/** HTTP path: required and must start with `/`. */
export function validatePath(val: string): string | undefined {
  if (!val) return REQUIRED_ERROR;
  if (!val.startsWith('/')) return 'Path must start with /';
  return undefined;
}

export function probeTypeLabel(type: ProbeType): string {
  switch (type) {
    case PROBE_TYPE.HTTP_GET:
      return 'HTTP GET Request';
    case PROBE_TYPE.TCP:
      return 'TCP Socket';
    case PROBE_TYPE.EXEC:
      return 'Execute a Command';
    default:
      return '';
  }
}

/** The editable form state for a single probe. */
export interface ProbeFormState {
  type: Exclude<ProbeType, ''>;
  /** Shared by httpGet and tcp (Devant keeps both defaulted to the same value). */
  port: string;
  path: string;
  httpHeaders: HttpHeader[];
  command: string[];
  failureThreshold: number;
  successThreshold: number;
  initialDelaySeconds: number;
  periodSeconds: number;
  timeoutSeconds: number;
}

export function defaultProbeForm(port = DEFAULT_PORT): ProbeFormState {
  return {
    type: PROBE_TYPE.HTTP_GET,
    port: String(port),
    path: '',
    httpHeaders: [],
    command: [],
    failureThreshold: 3,
    successThreshold: 1,
    initialDelaySeconds: 10,
    periodSeconds: 30,
    timeoutSeconds: 10,
  };
}

/** Seed the form from an existing probe. */
export function probeToForm(p: HCProbe, fallbackPort = DEFAULT_PORT): ProbeFormState {
  const d = defaultProbeForm(fallbackPort);
  const port = p.probe.httpGet?.port ?? p.probe.tcpSocket?.port;
  return {
    type: (p.type || PROBE_TYPE.HTTP_GET) as Exclude<ProbeType, ''>,
    port: port != null && port > 0 ? String(port) : d.port,
    path: p.probe.httpGet?.path ?? '',
    httpHeaders: p.probe.httpGet?.httpHeaders ?? [],
    command: p.probe.exec?.command ?? [],
    failureThreshold: p.probe.failureThreshold ?? d.failureThreshold,
    successThreshold: p.probe.successThreshold ?? d.successThreshold,
    initialDelaySeconds: p.probe.initialDelaySeconds ?? d.initialDelaySeconds,
    periodSeconds: p.probe.periodSeconds ?? d.periodSeconds,
    timeoutSeconds: p.probe.timeoutSeconds ?? d.timeoutSeconds,
  };
}

/** Build the wire probe from form state; all three mechanism sub-objects are present, irrelevant ones zeroed. */
export function formToProbe(form: ProbeFormState): HCProbe {
  const isHttp = form.type === PROBE_TYPE.HTTP_GET;
  const isTcp = form.type === PROBE_TYPE.TCP;
  const isExec = form.type === PROBE_TYPE.EXEC;
  return {
    type: form.type,
    probe: {
      failureThreshold: form.failureThreshold,
      initialDelaySeconds: form.initialDelaySeconds,
      periodSeconds: form.periodSeconds,
      successThreshold: form.successThreshold,
      timeoutSeconds: form.timeoutSeconds,
      httpGet: { path: form.path, port: isHttp ? Number(form.port) : 0, httpHeaders: form.httpHeaders },
      tcpSocket: { port: isTcp ? Number(form.port) : 0 },
      exec: { command: isExec ? form.command : [] },
    },
  };
}

/** Whether any field of a probe form differs from the state it started in. */
export function isProbeFormChanged(form: ProbeFormState, initial: ProbeFormState): boolean {
  return (Object.keys(initial) as (keyof ProbeFormState)[]).some((key) => JSON.stringify(form[key]) !== JSON.stringify(initial[key]));
}

/** Whether a probe form passes all required-field validations for its type. */
export function isProbeFormValid(form: ProbeFormState): boolean {
  if (form.type === PROBE_TYPE.HTTP_GET) {
    if (validatePort(form.port) || validatePath(form.path)) return false;
    return form.httpHeaders.every((h) => h.name.trim() !== '' && h.value.trim() !== '');
  }
  if (form.type === PROBE_TYPE.TCP) return !validatePort(form.port);
  return form.command.some((c) => c.trim() !== '');
}

/** Serialise an existing (read) probe back into a write probe; an unset probe becomes `{}`. */
export function serializeProbeForWrite(p: HCProbe | undefined, fallbackPort = DEFAULT_PORT): WriteProbe {
  if (!hasProbe(p)) return {};
  return formToProbe(probeToForm(p!, fallbackPort));
}
