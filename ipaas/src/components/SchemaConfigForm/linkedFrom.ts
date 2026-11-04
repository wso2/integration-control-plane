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
import type { LinkedSource } from '../../utils/resourceLinks';

export type { LinkedSource };

/** A resource key the picker offers, and the field that uses it already. */
export interface PickerKey {
  key: string;
  usedBy?: string;
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
