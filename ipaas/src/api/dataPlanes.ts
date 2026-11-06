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

// Org admin Data Planes (Runtimes).
//
// Wired: GET /dataplanes -> { items: [{ name }] }. OpenChoreo exposes only the
// data plane name (K8s resource name) through the BFF, so the richer Cluster
// fields are left undefined; the listing page tolerates this (no labels renders
// as a WSO2 Cloud Data Plane, no createdOn renders "—").
//
// listPdps has no BFF counterpart (private-data-plane provisioning isn't served),
// so it returns an empty list.
import type { Cluster, PdpManagerPdp } from '../types/dataPlanes';
import { bff, items, type ListResponse } from './_client';

interface BffDataPlane {
  name: string;
}

// A data plane surfaced by the BFF is always a live/registered runtime, so it maps
// to an active Cluster keyed by its name.
const toCluster = (dp: BffDataPlane): Cluster => ({
  id: dp.name,
  name: dp.name,
  isActive: true,
});

export const listDataPlanes = (): Promise<Cluster[]> => bff.get<ListResponse<BffDataPlane>>('/dataplanes').then((r) => items(r).map(toCluster));

// awaits: PDP manager endpoint — cloud has no private-data-plane provisioning.
export const listPdps = (): Promise<PdpManagerPdp[]> => Promise.resolve([]);
