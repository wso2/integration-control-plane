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

/** Managed Temporal servers. Calls the BFF's /temporal-servers routes, which provision on WSO2 PaaS. */

import type { DatabaseStatus } from '../types/databases';
import type { CreateTemporalInput, TemporalAvailability, TemporalCredentials, TemporalOffering, TemporalPlan, TemporalServer, TemporalServerDetail } from '../types/temporal';
import { bff, items, seg, type ListResponse } from './_client';

interface BffOffering {
  plans: TemporalPlan[] | null;
  defaultPlan?: string;
  temporalVersion?: string;
  maxNameLength?: number;
  plane?: { name: string; displayName?: string; region?: string; cloud?: string };
}

interface BffServer {
  id: string;
  name: string;
  status: string;
  statusMessage?: string;
  plan?: string;
  namespace?: string;
  createdAt?: string;
}

interface BffServerDetail extends BffServer {
  host?: string;
  port?: string;
  reachable: boolean;
  runningVersion?: string;
}

const STATUSES: readonly DatabaseStatus[] = ['CREATING', 'ACTIVE', 'DELETING', 'DELETED', 'ERROR'];

// An unknown status is shown as an error rather than trusted: a value this
// console does not know has no safe action attached to it.
const toStatus = (status: string): DatabaseStatus => ((STATUSES as readonly string[]).includes(status) ? (status as DatabaseStatus) : 'ERROR');

export const toTemporalServer = (s: BffServer): TemporalServer => ({
  id: s.id,
  name: s.name,
  status: toStatus(s.status),
  statusMessage: s.statusMessage,
  plan: s.plan,
  namespace: s.namespace,
  createdAt: s.createdAt,
});

export const toTemporalServerDetail = (s: BffServerDetail): TemporalServerDetail => ({
  ...toTemporalServer(s),
  host: s.host,
  port: s.port,
  reachable: s.reachable,
  runningVersion: s.runningVersion,
});

export const toTemporalOffering = (o: BffOffering): TemporalOffering => ({
  plans: o.plans ?? [],
  defaultPlan: o.defaultPlan,
  temporalVersion: o.temporalVersion,
  maxNameLength: o.maxNameLength,
  plane: o.plane,
});

export const fetchTemporalAvailability = (): Promise<TemporalAvailability> => bff.get<TemporalAvailability>('/temporal-servers/availability');

export const fetchTemporalOffering = (): Promise<TemporalOffering> => bff.get<BffOffering>('/temporal-servers/offering').then(toTemporalOffering);

export const fetchTemporalServers = (): Promise<TemporalServer[]> => bff.get<ListResponse<BffServer>>('/temporal-servers').then((r) => items(r).map(toTemporalServer));

export const fetchTemporalServer = (serverId: string): Promise<TemporalServerDetail> => bff.get<BffServerDetail>(`/temporal-servers/${seg(serverId)}`).then(toTemporalServerDetail);

export const createTemporalServer = (input: CreateTemporalInput): Promise<TemporalServer> => bff.post<BffServer>('/temporal-servers', input).then(toTemporalServer);

// Each call asks the provider for the key again; the BFF keeps nothing.
export const revealTemporalCredentials = (serverId: string): Promise<TemporalCredentials> => bff.get<TemporalCredentials>(`/temporal-servers/${seg(serverId)}/credentials`);

// Starts tearing the server down, its workflow history with it. It lists as
// DELETING until the provider finishes, then drops out of the list.
export const deleteTemporalServer = (serverId: string): Promise<void> => bff.delete<void>(`/temporal-servers/${seg(serverId)}`);
