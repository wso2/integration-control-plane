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

import { FormControl, FormLabel, TextField as OxygenTextField, type TextFieldProps } from '@wso2/oxygen-ui';
import { forwardRef, useId, useState } from 'react';

/** Oxygen's TextField with its label above the field, as the integration console lays out forms. */
const TextField = forwardRef<HTMLDivElement, TextFieldProps>(function TextField(props, ref) {
  const { label, id: idProp, sx, fullWidth, required, error, disabled, slotProps, onFocus, onBlur, helperText: helper, ...rest } = props;
  const generatedId = useId();
  const [focused, setFocused] = useState(false);
  // A field that can show an error keeps its helper line, so the error appearing does not shift the form.
  const helperText = error !== undefined && (helper == null || helper === '') ? ' ' : helper;

  if (label == null || label === '') return <OxygenTextField ref={ref} {...props} helperText={helperText} />;

  const id = idProp ?? generatedId;
  const labelId = `${id}-label`;
  const selectSlot = rest.select ? { select: { ...(slotProps?.select as object | undefined), labelId } } : {};

  return (
    <FormControl ref={ref} sx={sx} fullWidth={fullWidth} required={required} error={error} disabled={disabled} focused={focused}>
      <FormLabel id={labelId} htmlFor={id}>
        {label}
      </FormLabel>
      <OxygenTextField
        {...rest}
        id={id}
        fullWidth
        required={required}
        error={error}
        disabled={disabled}
        helperText={helperText}
        slotProps={{ ...slotProps, ...selectSlot }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    </FormControl>
  );
});

export default TextField;
