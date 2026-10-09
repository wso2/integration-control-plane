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

import { Autocomplete, Checkbox, Chip } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import type { JSX } from 'react';
import menuItems from './menuItems.json';

const LABEL_OPTIONS: string[] = [...menuItems.connectorCategories.categories.flatMap((cat) => cat.children.map((c) => c.value)), ...menuItems.pricingCategories.categories.map((cat) => cat.value)];

interface LabelsAutocompleteProps {
  value: string[];
  onChange: (newValue: string[]) => void;
  disabled?: boolean;
}

export default function LabelsAutocomplete({ value, onChange, disabled }: LabelsAutocompleteProps): JSX.Element {
  return (
    <Autocomplete
      multiple
      freeSolo
      disableCloseOnSelect
      disabled={disabled}
      options={LABEL_OPTIONS}
      value={value}
      onChange={(_e, newValue) => onChange(newValue as string[])}
      renderOption={(props, option, { selected }) => (
        <li {...props}>
          <Checkbox size="small" checked={selected} sx={{ mr: 1, p: 0 }} />
          {option}
        </li>
      )}
      renderTags={(val, getTagProps) => val.map((option, index) => <Chip label={option} size="small" {...getTagProps({ index })} key={option} />)}
      renderInput={(params) => <TextField {...params} label="Labels" size="small" placeholder="Type and press enter to add labels" />}
    />
  );
}
