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

import { MenuItem, Stack, ToggleButton, ToggleButtonGroup } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import type { JSX } from 'react';
import { GRANULARITY_LABELS, RANGE_GRANULARITIES, type DeliveryGranularity, type DeliveryRange } from '../../../types/delivery';

const RANGES: DeliveryRange[] = ['1M', '3M', '6M', '1Y'];

interface TimeRangeSelectorProps {
  range: DeliveryRange;
  granularity: DeliveryGranularity;
  onRangeChange: (range: DeliveryRange) => void;
  onGranularityChange: (granularity: DeliveryGranularity) => void;
}

/** 1M/3M/6M/1Y toggle + "View by Day/Week/Month" select. Granularity options are
 * constrained per range and snap to the first allowed one on range change
 * (mirrors Devant's TimeSelector). */
export default function TimeRangeSelector({ range, granularity, onRangeChange, onGranularityChange }: TimeRangeSelectorProps): JSX.Element {
  const allowed = RANGE_GRANULARITIES[range];

  const handleRange = (value: DeliveryRange) => {
    onRangeChange(value);
    const nextAllowed = RANGE_GRANULARITIES[value];
    if (!nextAllowed.includes(granularity)) onGranularityChange(nextAllowed[0]);
  };

  return (
    <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
      <ToggleButtonGroup exclusive size="small" value={range} onChange={(_, v: DeliveryRange | null) => v && handleRange(v)}>
        {RANGES.map((r) => (
          <ToggleButton key={r} value={r} sx={{ px: 1.5, textTransform: 'none' }}>
            {r}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <TextField select size="small" value={granularity} onChange={(e) => onGranularityChange(e.target.value as DeliveryGranularity)} sx={{ minWidth: 160 }}>
        {allowed.map((g) => (
          <MenuItem key={g} value={g}>
            {GRANULARITY_LABELS[g]}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
