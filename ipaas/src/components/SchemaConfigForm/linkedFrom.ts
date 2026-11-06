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

/** Where a linked field's value comes from in the form's environment. */
export interface LinkedSource {
  /** The resource's display name. */
  resource: string;
  key: string;
  /** The field's own link beats its connection's. */
  overrides?: boolean;
  /** The environment the resource has no values in. */
  noValuesIn?: string;
  /** Declared in the repository's workload.yaml, not linked. */
  declared?: boolean;
}

/** A linked field's read-only value: where it comes from. */
export const fromText = ({ resource, key, declared }: Pick<LinkedSource, 'resource' | 'key' | 'declared'>): string => (declared ? `from workload.yaml (${resource} · ${key})` : `from ${resource} · ${key}`);

/** A resource key the picker offers: the field that uses it already, or the lost target a pick takes it from. */
export interface PickerKey {
  key: string;
  usedBy?: string;
  orphanOf?: string;
}

/** The choices of a field's link icon. `selected` is `first` for no own link, else `resource|key`. */
export interface FieldLinkPicker {
  first: 'Enter a value' | 'Via selected Link';
  selected: string;
  resources: { id: string; name: string; keys: PickerKey[] }[];
  onPick: (pick: { resource: string; key: string } | null) => void;
}

/** One field's link in the form: its source, and the picker when links can change here. */
export interface FieldLink {
  source?: LinkedSource;
  picker?: FieldLinkPicker;
}

export type FieldLinks = (jsonPath: string) => FieldLink | undefined;

export const noFieldLinks: FieldLinks = () => undefined;

export const FieldLinkContext = createContext<FieldLinks>(noFieldLinks);

export const useFieldLink = (jsonPath: string): FieldLink | undefined => useContext(FieldLinkContext)(jsonPath);
