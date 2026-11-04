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

import { Stack, TextField, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { CONTEXT_ENGINE_DESCRIPTION_HINT, CONTEXT_ENGINE_DESCRIPTION_MAX, CONTEXT_ENGINE_NAME_MAX } from '../../../constants/contextEngine';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import { engineDescriptionError, engineNameError } from '../../../utils/contextEngine';
import { fieldStackSx, stepHeadingSx, stepHintSx } from '../styles';

interface NameStepProps {
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}

/** The engine's name and description, which people and connected agents see when choosing an engine. */
export default function NameStep({ name, description, onNameChange, onDescriptionChange }: NameStepProps): JSX.Element {
  const nameError = engineNameError(name);
  const descriptionError = engineDescriptionError(description);

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Name
      </Typography>
      <Typography variant="body2" sx={stepHintSx}>
        Give the engine a name your team will recognise.
      </Typography>

      <Stack sx={fieldStackSx}>
        <TextField
          label="Name"
          required
          fullWidth
          size="small"
          autoFocus
          value={name}
          error={!!nameError}
          helperText={nameError || `${name.length}/${CONTEXT_ENGINE_NAME_MAX}`}
          onChange={(e) => onNameChange(e.target.value)}
          sx={REQUIRED_FIELD_SX}
          inputProps={{ 'aria-label': 'Engine name' }}
        />
        <TextField
          label="Description"
          fullWidth
          multiline
          minRows={2}
          size="small"
          value={description}
          error={!!descriptionError}
          helperText={descriptionError || `${CONTEXT_ENGINE_DESCRIPTION_HINT} ${description.length}/${CONTEXT_ENGINE_DESCRIPTION_MAX}`}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </Stack>
    </>
  );
}
