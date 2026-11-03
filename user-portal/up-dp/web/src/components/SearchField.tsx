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

import { InputAdornment } from '@wso2/oxygen-ui';
import { Search } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from '../i18n';
import TextField from './common/TextField';

export const FILTER_SELECT_SX = { '&& .MuiSelect-select': { py: '8.5px' } } as const;

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fullWidth?: boolean;
  /** Filter chips and a filter button at the end of the field. */
  end?: ReactNode;
  sx?: object;
}

export default function SearchField({ value, onChange, placeholder: placeholderProp, fullWidth, end, sx }: SearchFieldProps) {
  const { t } = useTranslation();
  const placeholder = placeholderProp ?? t('common.actions.search');
  return (
    <TextField
      fullWidth={fullWidth}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      size="small"
      sx={sx}
      slotProps={{
        htmlInput: { 'aria-label': placeholder },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Search size={18} />
            </InputAdornment>
          ),
          endAdornment: end ? <InputAdornment position="end">{end}</InputAdornment> : undefined,
        },
      }}
    />
  );
}
