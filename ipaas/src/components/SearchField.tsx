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

import { SearchBar } from '@wso2/oxygen-ui';

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** Names what is searched ("Search projects"); SearchBar also uses it as the field's accessible name. */
  placeholder: string;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  /** `standard` is the list and grid page search: 400px, shrinking in narrower containers. `fullWidth` wins. */
  width?: 'auto' | 'standard';
  sx?: object;
};

// Oxygen 0.20's SearchBar `width="standard"`; pass the prop through once the console is on 0.20.
const STANDARD_WIDTH_SX = { width: '100%', maxWidth: 400 } as const;

export default function SearchField({ value, onChange, placeholder, size = 'small', fullWidth, width = 'auto', sx }: SearchFieldProps) {
  const widthSx = width === 'standard' && !fullWidth ? { ...STANDARD_WIDTH_SX, ...sx } : sx;
  return <SearchBar value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} size={size} fullWidth={fullWidth} sx={widthSx} />;
}
