/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import { InputAdornment } from '@wso2/oxygen-ui';
import { Search } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
