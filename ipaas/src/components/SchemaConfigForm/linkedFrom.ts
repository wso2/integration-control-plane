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

import { createContext, useContext } from 'react';

/**
 * Where a linked field's value comes from in the form's environment: a resource key, or an
 * endpoint of this project, whose address the platform resolves per environment.
 */
export interface LinkedSource {
  /** The resource's display name, or the endpoint's integration. */
  resource: string;
  key: string;
  /** An endpoint of this project rather than a resource key: it supplies the whole address. */
  endpoint?: boolean;
  /** The field's own link beats its connection's. */
  overrides?: boolean;
  /** The environment the resource has no values in. */
  noValuesIn?: string;
  /** Declared in the repository's workload.yaml, not linked. */
  declared?: boolean;
}

/** A linked field's read-only value: where it comes from. */
export const fromText = ({ resource, key, endpoint, declared }: Pick<LinkedSource, 'resource' | 'key' | 'endpoint' | 'declared'>): string => {
  // An endpoint supplies an address the platform resolves per environment, not a stored key.
  const source = endpoint ? `address of ${resource} · ${key}` : `${resource} · ${key}`;
  return declared ? `from workload.yaml (${source})` : `from ${source}`;
};

/** A resource key the picker offers: the field that uses it already, or the lost target a pick takes it from. */
export interface PickerKey {
  key: string;
  usedBy?: string;
  orphanOf?: string;
}

/** An integration of another project the field can take a value of, with the values it offers. */
export interface PickerConnection {
  /** `<project>/<component>/<endpoint>`, which a pick writes with the chosen output. */
  id: string;
  name: string;
  outputs: { name: string; secret: boolean }[];
  /** Why it cannot be chosen; it is offered disabled, so the reason is visible. */
  unavailable?: string;
}

/** An integration of this project the field can take the address of, and where it cannot be called. */
export interface PickerEndpoint {
  /** `<project>/<component>/<endpoint>`, which is what a pick writes. */
  id: string;
  name: string;
  /** Why it cannot be chosen; it is offered disabled, so the reason is visible. */
  unavailable?: string;
}

/** The choices of a field's link icon. `selected` is `first` for no own link, else `resource|key` or an endpoint id. */
export interface FieldLinkPicker {
  first: 'Enter a value' | 'Via selected Link';
  selected: string;
  resources: { id: string; name: string; keys: PickerKey[] }[];
  /** Endpoints of this project, which supply an address and need no key. */
  endpoints?: PickerEndpoint[];
  /**
   * Endpoints of other projects no connection stands for yet. Each is picked by one of its outputs,
   * which makes the connection and feeds the field that value; thereafter it is an ordinary resource.
   */
  connections?: PickerConnection[];
  onPick: (pick: { resource: string; key: string } | { endpoint: string; key?: string } | null) => void;
  /** Another link change is on its way: one at a time, so no write replaces another's. */
  disabled?: boolean;
}

/** One field's link in the form: its source, the picker when links can change here, and whether a link write is on its way. */
export interface FieldLink {
  source?: LinkedSource;
  picker?: FieldLinkPicker;
  /** A link write is in flight: what feeds the field is about to change, so it takes no value meanwhile. */
  busy?: boolean;
}

export type FieldLinks = (jsonPath: string) => FieldLink | undefined;

export const noFieldLinks: FieldLinks = () => undefined;

export const FieldLinkContext = createContext<FieldLinks>(noFieldLinks);

export const useFieldLink = (jsonPath: string): FieldLink | undefined => useContext(FieldLinkContext)(jsonPath);
