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

import { FormControlLabel, Radio, RadioGroup, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import ScheduleFields from '../../Overview/_shared/ScheduleFields';
import type { ScheduleFormApi } from '../../Overview/_shared/useScheduleForm';
import { fieldStackSx, stepHeadingSx } from '../styles';

export type IngestionMode = 'once' | 'scheduled';

interface IngestionScheduleStepProps {
  mode: IngestionMode;
  onModeChange: (mode: IngestionMode) => void;
  schedule: ScheduleFormApi;
}

/** When a data source loads its documents: once, now, or on a schedule. */
export default function IngestionScheduleStep({ mode, onModeChange, schedule }: IngestionScheduleStepProps): JSX.Element {
  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Configure Ingestion Schedule
      </Typography>
      <Stack sx={fieldStackSx}>
        <RadioGroup value={mode} onChange={(e) => onModeChange(e.target.value as IngestionMode)}>
          <FormControlLabel value="once" control={<Radio size="small" />} label="Ingest once, now" />
          <FormControlLabel value="scheduled" control={<Radio size="small" />} label="Ingest on a schedule, to pick up changes in the source" />
        </RadioGroup>
        {/* Ingestion runs never overlap and time out at the platform's limit, so only the schedule is configurable. */}
        {mode === 'scheduled' && <ScheduleFields form={schedule} executionSettings={false} />}
      </Stack>
    </>
  );
}
