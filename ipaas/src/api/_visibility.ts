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
 * Endpoint visibility: the OpenChoreo wire enum the BFF stores, and the labels the UI shows
 * (the `VISIBILITY_OPTS` keys in `components/EndpointCard`). Shared by `deployments.ts`, which
 * reads it, and `components.ts`, which writes it.
 */

/** Wire value -> UI label. The inverse is derived, so the two cannot drift. */
const VISIBILITY_LABEL: Record<string, string> = {
  external: 'Public',
  internal: 'Organization',
  project: 'Project',
};

const VISIBILITY_WIRE: Record<string, string> = Object.fromEntries(Object.entries(VISIBILITY_LABEL).map(([wire, label]) => [label, wire]));

/** Unmapped values pass through, so the BFF rejects them rather than storing a wrong one. */
export const toVisibilityWire = (label: string): string => VISIBILITY_WIRE[label] ?? label;

export const toVisibilityLabel = (wire: string): string => VISIBILITY_LABEL[wire] ?? wire;
