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

import { Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../common/TextField';
import type { JSX } from 'react';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import { knowledgeBaseNameError, knowledgeBaseNameFrom, type NameFields } from '../../../utils/knowledgeBase';
import { fieldStackSx, stepHeadingSx } from '../styles';

interface NameStepProps {
  heading: string;
  value: NameFields;
  onChange: (value: NameFields) => void;
  /** Data sources have no description. */
  withDescription?: boolean;
}

/**
 * Display name, name and description. The name follows the display name until
 * the user edits it, since it cannot be changed once created. Whether it was edited
 * is read from the values, not kept in state, so it survives going Back and returning.
 */
export default function NameStep({ heading, value, onChange, withDescription = true }: NameStepProps): JSX.Element {
  const nameEdited = value.name !== knowledgeBaseNameFrom(value.displayName);
  const nameError = knowledgeBaseNameError(value.name);
  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        {heading}
      </Typography>
      <Stack sx={fieldStackSx}>
        <TextField
          label="Display Name"
          required
          fullWidth
          size="small"
          value={value.displayName}
          onChange={(e) => onChange({ ...value, displayName: e.target.value, name: nameEdited ? value.name : knowledgeBaseNameFrom(e.target.value) })}
          sx={REQUIRED_FIELD_SX}
        />
        <TextField
          label="Name"
          required
          fullWidth
          size="small"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          error={!!nameError}
          helperText={nameError || 'Identifies it in URLs and integrations. It cannot be changed later.'}
          sx={REQUIRED_FIELD_SX}
        />
        {withDescription && <TextField label="Description" fullWidth size="small" multiline minRows={2} value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} />}
      </Stack>
    </>
  );
}
