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
