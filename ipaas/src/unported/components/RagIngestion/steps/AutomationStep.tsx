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

import { MenuItem, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { useEffect, type JSX } from 'react';
import { useActiveProjects } from '../../../../hooks/useProjects';
import { useComponentNameAvailability } from '../../../../hooks/useRepository';
import { componentNameError, slugify } from '../../../../utils/ragIngestion';
import { REQUIRED_FIELD_SX } from '../../../../constants/styles';
import { fieldStackSx, stepHeadingSx } from '../styles';
import type { AutomationConfig } from '../../../../types/ragIngestion';

interface AutomationStepProps {
  value: AutomationConfig;
  onChange: (value: AutomationConfig) => void;
  /** Section heading — overridable so the RAG Service form can reuse this. */
  heading?: string;
}

export default function AutomationStep({ value, onChange, heading = 'Create Automation' }: AutomationStepProps): JSX.Element {
  const { data: projects, isLoading } = useActiveProjects();

  // Default to the first project once the list loads, and drop a selection that has
  // since stopped being active — it would target a project mid-deletion.
  useEffect(() => {
    if (!projects) return;
    if (value.projectId && projects.some((p) => p.id === value.projectId)) return;
    const replacement = projects[0]?.id ?? '';
    if (replacement !== value.projectId) onChange({ ...value, projectId: replacement });
  }, [projects, value, onChange]);

  const availability = useComponentNameAvailability(value.projectId, value.name);
  const formatError = componentNameError(value.name);
  const takenError = availability.data && !availability.data.componentNameUnique ? `Name is already in use. Try "${availability.data.alternateComponentName}".` : '';
  const nameError = formatError || takenError;

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        {heading}
      </Typography>
      <Stack sx={fieldStackSx}>
        <TextField select label="Target Project" required fullWidth size="small" value={value.projectId} disabled={isLoading} onChange={(e) => onChange({ ...value, projectId: e.target.value })} sx={REQUIRED_FIELD_SX}>
          {(projects ?? []).map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Display Name" required fullWidth size="small" value={value.displayName} onChange={(e) => onChange({ ...value, displayName: e.target.value, name: slugify(e.target.value) })} sx={REQUIRED_FIELD_SX} />
        <TextField label="Name" required fullWidth size="small" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} error={!!nameError} helperText={nameError || undefined} sx={REQUIRED_FIELD_SX} />
        <TextField label="Description (Optional)" fullWidth size="small" multiline minRows={2} value={value.description} placeholder="Enter description here" onChange={(e) => onChange({ ...value, description: e.target.value })} />
      </Stack>
    </>
  );
}
