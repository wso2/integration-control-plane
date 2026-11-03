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
import { defaultProbeForm, formToProbe, hasProbe, isProbeFormChanged, isProbeFormValid, probeToForm, probeTypeLabel, serializeProbeForWrite, validatePath, validatePort } from './healthChecks';
import { PROBE_TYPE, type HCProbe } from '../types/healthChecks';

const httpProbe: HCProbe = {
  type: PROBE_TYPE.HTTP_GET,
  probe: {
    failureThreshold: 3,
    initialDelaySeconds: 10,
    periodSeconds: 30,
    successThreshold: 1,
    timeoutSeconds: 10,
    httpGet: { port: 8080, path: '/test', httpHeaders: [{ name: 'k', value: 'v' }] },
  },
};

describe('hasProbe / probeTypeLabel', () => {
  it('detects a configured probe by non-empty type', () => {
    expect(hasProbe(httpProbe)).toBe(true);
    expect(hasProbe({ type: '', probe: {} as HCProbe['probe'] })).toBe(false);
    expect(hasProbe(undefined)).toBe(false);
  });

  it('labels probe types', () => {
    expect(probeTypeLabel(PROBE_TYPE.HTTP_GET)).toBe('HTTP GET Request');
    expect(probeTypeLabel(PROBE_TYPE.TCP)).toBe('TCP Socket');
    expect(probeTypeLabel(PROBE_TYPE.EXEC)).toBe('Execute a Command');
    expect(probeTypeLabel('')).toBe('');
  });
});

describe('probeToForm', () => {
  it('reads httpGet port/path/headers and thresholds', () => {
    const f = probeToForm(httpProbe);
    expect(f).toMatchObject({ type: 'httpGet', port: '8080', path: '/test', failureThreshold: 3, successThreshold: 1 });
    expect(f.httpHeaders).toEqual([{ name: 'k', value: 'v' }]);
  });

  it('falls back to the default port when unset', () => {
    const f = probeToForm({ type: 'exec', probe: { failureThreshold: 3, initialDelaySeconds: 10, periodSeconds: 30, successThreshold: 1, timeoutSeconds: 10, exec: { command: ['sh', '-c'] } } }, 9000);
    expect(f.port).toBe('9000');
    expect(f.command).toEqual(['sh', '-c']);
  });
});

describe('validatePort / validatePath', () => {
  it('requires a digits-only port of at most 5 chars', () => {
    expect(validatePort('8080')).toBeUndefined();
    expect(validatePort('')).toBe('This field is required');
    expect(validatePort('  ')).toBe('This field is required');
    expect(validatePort('80a')).toBe('Invalid port number');
    expect(validatePort('123456')).toBe('Invalid port number');
  });

  it('requires a path starting with /', () => {
    expect(validatePath('/healthz')).toBeUndefined();
    expect(validatePath('')).toBe('This field is required');
    expect(validatePath('healthz')).toBe('Path must start with /');
  });
});

describe('isProbeFormChanged', () => {
  it('is false for an untouched form and true once a field differs', () => {
    const initial = defaultProbeForm(8080);
    expect(isProbeFormChanged({ ...initial }, initial)).toBe(false);
    expect(isProbeFormChanged({ ...initial, path: '/health' }, initial)).toBe(true);
    expect(isProbeFormChanged({ ...initial, periodSeconds: 60 }, initial)).toBe(true);
  });

  it('compares header and command lists by value', () => {
    const initial = { ...defaultProbeForm(), httpHeaders: [{ name: 'a', value: '1' }] };
    expect(isProbeFormChanged({ ...initial, httpHeaders: [{ name: 'a', value: '1' }] }, initial)).toBe(false);
    expect(isProbeFormChanged({ ...initial, httpHeaders: [{ name: 'a', value: '2' }] }, initial)).toBe(true);
    expect(isProbeFormChanged({ ...initial, command: ['sh'] }, initial)).toBe(true);
  });
});

describe('isProbeFormValid', () => {
  it('validates httpGet port, path and headers', () => {
    const base = { ...defaultProbeForm(), type: 'httpGet' as const, port: '8080', path: '/health' };
    expect(isProbeFormValid(base)).toBe(true);
    expect(isProbeFormValid({ ...base, path: '' })).toBe(false);
    expect(isProbeFormValid({ ...base, port: 'x' })).toBe(false);
    expect(isProbeFormValid({ ...base, httpHeaders: [{ name: 'k', value: '' }] })).toBe(false);
    expect(isProbeFormValid({ ...base, httpHeaders: [{ name: 'k', value: 'v' }] })).toBe(true);
  });

  it('validates tcp port', () => {
    expect(isProbeFormValid({ ...defaultProbeForm(), type: 'tcp', port: '9090' })).toBe(true);
    expect(isProbeFormValid({ ...defaultProbeForm(), type: 'tcp', port: '' })).toBe(false);
  });
});

describe('serializeProbeForWrite', () => {
  it('returns {} for an unset probe', () => {
    expect(serializeProbeForWrite(undefined)).toEqual({});
    expect(serializeProbeForWrite({ type: '', probe: {} as HCProbe['probe'] })).toEqual({});
  });

  it('preserves an untouched HTTP probe (port/path/headers/thresholds) on round-trip', () => {
    const w = serializeProbeForWrite(httpProbe);
    expect(w).not.toEqual({});
    const p = (w as HCProbe).probe;
    expect((w as HCProbe).type).toBe('httpGet');
    expect(p.httpGet).toEqual({ path: '/test', port: 8080, httpHeaders: [{ name: 'k', value: 'v' }] });
    expect(p.tcpSocket).toEqual({ port: 0 });
    expect(p).toMatchObject({ failureThreshold: 3, successThreshold: 1, initialDelaySeconds: 10, periodSeconds: 30, timeoutSeconds: 10 });
  });

  it('preserves an untouched TCP probe port', () => {
    const tcp: HCProbe = { type: 'tcp', probe: { failureThreshold: 3, initialDelaySeconds: 10, periodSeconds: 30, successThreshold: 1, timeoutSeconds: 10, tcpSocket: { port: 9090 } } };
    const w = serializeProbeForWrite(tcp) as HCProbe;
    expect(w.type).toBe('tcp');
    expect(w.probe.tcpSocket).toEqual({ port: 9090 });
    expect(w.probe.httpGet?.port).toBe(0);
  });

  it('round-trips an exec probe command unencoded', () => {
    const exec: HCProbe = { type: 'exec', probe: { failureThreshold: 3, initialDelaySeconds: 10, periodSeconds: 30, successThreshold: 1, timeoutSeconds: 10, exec: { command: ['sh', '-c'] } } };
    const w = serializeProbeForWrite(exec) as HCProbe;
    expect(w.type).toBe('exec');
    expect(w.probe.exec).toEqual({ command: ['sh', '-c'] });
  });
});

describe('isProbeFormValid exec', () => {
  it('rejects an exec probe with no command', () => {
    expect(isProbeFormValid({ ...defaultProbeForm(), type: 'exec', command: [] })).toBe(false);
  });

  it('rejects an exec probe whose only entry is blank', () => {
    expect(isProbeFormValid({ ...defaultProbeForm(), type: 'exec', command: ['   '] })).toBe(false);
  });

  it('accepts an exec probe with a command', () => {
    expect(isProbeFormValid({ ...defaultProbeForm(), type: 'exec', command: ['sh', '-c'] })).toBe(true);
  });
});

describe('formToProbe', () => {
  it('builds an httpGet probe, zeroing tcp/exec', () => {
    const p = formToProbe({ ...defaultProbeForm(), type: 'httpGet', port: '8080', path: '/health', httpHeaders: [{ name: 'a', value: 'b' }] });
    expect(p.type).toBe('httpGet');
    expect(p.probe.httpGet).toEqual({ path: '/health', port: 8080, httpHeaders: [{ name: 'a', value: 'b' }] });
    expect(p.probe.tcpSocket).toEqual({ port: 0 });
    expect(p.probe.exec).toEqual({ command: [] });
  });

  it('builds a tcp probe with the port, zeroing httpGet/exec', () => {
    const p = formToProbe({ ...defaultProbeForm(), type: 'tcp', port: '9090' });
    expect(p.probe.tcpSocket).toEqual({ port: 9090 });
    expect(p.probe.httpGet?.port).toBe(0);
    expect(p.probe.exec).toEqual({ command: [] });
  });

  it('builds an exec probe with the command verbatim', () => {
    const p = formToProbe({ ...defaultProbeForm(), type: 'exec', command: ['some', 'one'] });
    expect(p.type).toBe('exec');
    expect(p.probe.exec).toEqual({ command: ['some', 'one'] });
    expect(p.probe.httpGet?.port).toBe(0);
    expect(p.probe.tcpSocket).toEqual({ port: 0 });
  });
});
