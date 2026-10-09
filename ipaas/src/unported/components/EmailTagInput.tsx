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

import { Box, Chip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { type JSX, type KeyboardEvent, useState } from 'react';
import { emailErrorMessages, isValidEmailAddress } from '../utils/emailTagInput';

interface EmailTagInputProps {
  label: string;
  placeholder?: string;
  value: string[];
  onChange: (emails: string[]) => void;
  maxCount?: number;
  error?: boolean;
  helperText?: string;
  required?: boolean;
}

export default function EmailTagInput(props: EmailTagInputProps): JSX.Element {
  const { label, placeholder, value, onChange, maxCount = 5, error, helperText, required } = props;
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');

  const addEmail = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;

    if (!isValidEmailAddress(trimmed)) {
      setInputError(emailErrorMessages.invalidEmail);
      return;
    }
    if (value.includes(trimmed)) {
      setInputError(emailErrorMessages.duplicateEmail);
      return;
    }
    if (value.length >= maxCount) {
      setInputError(emailErrorMessages.maxEmailExceeded);
      return;
    }

    setInputError('');
    setInputValue('');
    onChange([...value, trimmed]);
  };

  const removeEmail = (email: string) => {
    onChange(value.filter((e) => e !== email));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeEmail(value[value.length - 1]);
    }
  };

  const displayError = inputError || helperText;
  const hasError = error || !!inputError;

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>
        {label}
        {required && (
          <Typography component="span" color="error">
            {' '}
            *
          </Typography>
        )}
      </Typography>
      <Box
        sx={{
          border: (theme) => `1px solid ${hasError ? theme.palette.error.main : theme.palette.divider}`,
          borderRadius: 0.8,
          p: 1,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0.5,
          minHeight: 10,
          alignItems: 'center',
          backgroundColor: (theme) => theme.palette.background.acrylic,
          '&:focus-within': {
            border: (theme) => `2px solid ${hasError ? theme.palette.error.main : theme.palette.primary.main}`,
            borderColor: (theme) => (hasError ? theme.palette.error.main : theme.palette.primary.main),
          },
        }}>
        {value.map((email) => (
          <Chip key={email} label={email} size="small" onDelete={() => removeEmail(email)} />
        ))}
        <TextField
          variant="standard"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setInputError('');
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue) addEmail(inputValue);
          }}
          placeholder={value.length === 0 ? placeholder : undefined}
          InputProps={{ disableUnderline: true }}
          sx={{ flex: 1, minHeight: 10, minWidth: 120, paddingLeft: 0.75 }}
          size="small"
        />
      </Box>
      {displayError && (
        <Typography variant="caption" color={hasError ? 'error' : 'textSecondary'} sx={{ mt: 0.5, display: 'block' }}>
          {displayError}
        </Typography>
      )}
      <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.25 }}>
        Press Enter or comma to add. Max {maxCount} emails.
      </Typography>
    </Box>
  );
}
