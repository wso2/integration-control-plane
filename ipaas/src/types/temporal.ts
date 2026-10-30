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
 * Managed Temporal servers, provisioned on WSO2 PaaS through the BFF. A server
 * belongs to the organization and runs one namespace, "default".
 */

import type { DatabaseAvailability, DatabasePlane, DatabaseStatus } from './databases';

/** Platform services share one status vocabulary. */
export type TemporalStatus = DatabaseStatus;

export type TemporalAvailability = DatabaseAvailability;

export interface TemporalPlan {
  id: string;
  /** How many of each Temporal service (frontend, history, matching, worker) the plan runs. */
  replicas: number;
  /** What the plan's Temporal services reserve in total, as Kubernetes quantities. */
  cpu?: string;
  memory?: string;
  /** Bounds the server's workflow throughput; fixed for the server's life. */
  historyShards?: number;
  /** Size of the server's internal store. */
  storageGi?: number;
  /** List price per server; absent when unpriced. */
  monthlyPrice?: number;
  currency?: string;
}

export interface TemporalOffering {
  plans: TemporalPlan[];
  defaultPlan?: string;
  /** The Temporal version every new server runs; not chosen. */
  temporalVersion?: string;
  /** The longest name the provider accepts; absent when it publishes none. */
  maxNameLength?: number;
  plane?: DatabasePlane;
}

export interface TemporalServer {
  /** Opaque id, used only in URLs and BFF paths. */
  id: string;
  name: string;
  status: TemporalStatus;
  statusMessage?: string;
  plan?: string;
  namespace?: string;
  createdAt?: string;
}

export interface TemporalServerDetail extends TemporalServer {
  host?: string;
  port?: string;
  /**
   * Whether `host` is reachable from integrations. When false, it is the
   * address inside the provider's own platform only.
   */
  reachable: boolean;
  runningVersion?: string;
}

export interface CreateTemporalInput {
  name: string;
  plan?: string;
}

/** The server's API key, revealed fresh on every request and never cached. */
export interface TemporalCredentials {
  apiKey: string;
  namespace?: string;
  host?: string;
  port?: string;
}
