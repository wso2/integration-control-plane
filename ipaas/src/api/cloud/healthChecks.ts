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

/** The BFF addresses probes per (component, environment) with no id, so the env stands in for every id devant carries. */

import { bff, seg } from './_client';
import { PROBE_TYPE, type HCProbe, type HealthCheck, type HealthCheckWriteData, type ProbeType, type WriteProbe } from '../../types/healthChecks';

interface BffProbe {
  httpGet?: { path?: string; port?: number; httpHeaders?: { name: string; value: string }[] };
  tcpSocket?: { port?: number };
  exec?: { command?: string[] };
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  failureThreshold?: number;
  successThreshold?: number;
}

interface BffHealthCheck {
  environment?: string;
  livenessProbe?: BffProbe;
  readinessProbe?: BffProbe;
  syncStatus?: string;
  syncMessage?: string;
}

const hcPath = (componentId: string, env: string): string => `/components/${seg(componentId)}/environments/${seg(env)}/health-check`;

// The BFF sets exactly one action; the page keys its form off the matching discriminator.
function probeTypeOf(p: BffProbe): ProbeType {
  if (p.httpGet) return PROBE_TYPE.HTTP_GET;
  if (p.tcpSocket) return PROBE_TYPE.TCP;
  if (p.exec) return PROBE_TYPE.EXEC;
  return '';
}

// `type: ''` is what marks a probe unconfigured; the zeroed timings are never read.
const emptyProbe = (): HCProbe => ({ type: '', probe: { failureThreshold: 0, initialDelaySeconds: 0, periodSeconds: 0, successThreshold: 0, timeoutSeconds: 0 } });

function toHCProbe(p: BffProbe | undefined): HCProbe {
  if (!p) return emptyProbe();
  const type = probeTypeOf(p);
  if (!type) return emptyProbe();
  return {
    type,
    probe: {
      failureThreshold: p.failureThreshold ?? 0,
      initialDelaySeconds: p.initialDelaySeconds ?? 0,
      periodSeconds: p.periodSeconds ?? 0,
      successThreshold: p.successThreshold ?? 0,
      timeoutSeconds: p.timeoutSeconds ?? 0,
      httpGet: p.httpGet ? { path: p.httpGet.path ?? '', port: p.httpGet.port ?? 0, httpHeaders: p.httpGet.httpHeaders ?? [] } : undefined,
      tcpSocket: p.tcpSocket ? { port: p.tcpSocket.port ?? 0 } : undefined,
      exec: p.exec ? { command: p.exec.command ?? [] } : undefined,
    },
  };
}

// Only the selected mechanism is sent: the page zeroes the other two, and a zeroed port fails the schema.
function toBffProbe(p: WriteProbe): BffProbe | undefined {
  if (!('probe' in p) || !p.type) return undefined;
  const { probe, type } = p;
  const out: BffProbe = {
    failureThreshold: probe.failureThreshold,
    initialDelaySeconds: probe.initialDelaySeconds,
    periodSeconds: probe.periodSeconds,
    successThreshold: probe.successThreshold,
    timeoutSeconds: probe.timeoutSeconds,
  };
  if (type === PROBE_TYPE.HTTP_GET) out.httpGet = { path: probe.httpGet?.path ?? '', port: probe.httpGet?.port ?? 0, httpHeaders: probe.httpGet?.httpHeaders ?? [] };
  if (type === PROBE_TYPE.TCP) out.tcpSocket = { port: probe.tcpSocket?.port ?? 0 };
  if (type === PROBE_TYPE.EXEC) out.exec = { command: probe.exec?.command ?? [] };
  return out;
}

function toHealthCheck(env: string, hc: BffHealthCheck): HealthCheck {
  return {
    ID: env,
    container_id: env,
    app_environment_id: env,
    probes: { liveness_probe: toHCProbe(hc.livenessProbe), readiness_probe: toHCProbe(hc.readinessProbe) },
    sync_status: hc.syncStatus,
    sync_message: hc.syncMessage,
  };
}

const putProbes = async (componentId: string, env: string, data: HealthCheckWriteData): Promise<HealthCheck> => {
  const livenessProbe = toBffProbe(data.probes.liveness_probe);
  const readinessProbe = toBffProbe(data.probes.readiness_probe);
  await bff.put(hcPath(componentId, env), { livenessProbe, readinessProbe });
  return toHealthCheck(env, { livenessProbe, readinessProbe });
};

// An unconfigured environment reads as no health check at all, so the page shows its empty state.
export const getHealthChecks = async (_orgUuid: string, _projectId: string, componentId: string, _releaseId: string, environmentId: string): Promise<HealthCheck[]> => {
  if (!environmentId) return [];
  const hc = await bff.get<BffHealthCheck>(hcPath(componentId, environmentId));
  if (!hc?.livenessProbe && !hc?.readinessProbe) return [];
  return [toHealthCheck(environmentId, hc)];
};

export const createHealthCheck = (_orgUuid: string, _projectId: string, componentId: string, _releaseId: string, environmentId: string, _containerId: string, data: HealthCheckWriteData): Promise<HealthCheck> => putProbes(componentId, environmentId, data);

export const updateHealthCheck = (_orgUuid: string, _projectId: string, componentId: string, _releaseId: string, environmentId: string, _containerId: string, _healthCheckId: string, data: HealthCheckWriteData): Promise<HealthCheck> =>
  putProbes(componentId, environmentId, data);

export const deleteHealthCheck = async (_orgUuid: string, _projectId: string, componentId: string, _releaseId: string, environmentId: string, _containerId: string, _healthCheckId: string): Promise<void> => {
  if (environmentId) await bff.delete(hcPath(componentId, environmentId));
};
