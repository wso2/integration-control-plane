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

import { Box, FormControlLabel, Paper, Slider, Switch, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

const panelSx = { p: 2, flex: 1, minWidth: 260 } as const;
const sliderBoxSx = (enabled: boolean) => ({ px: 1, mt: 1, opacity: enabled ? 1 : 0.5 }) as const;

interface ThresholdSliderProps {
  label: string;
  enabled: boolean;
  value: number;
  min: number;
  max: number;
  onToggle: (v: boolean) => void;
  onChange: (v: number) => void;
  /** Called once the user lets go of the slider (or finishes a keyboard step), with the settled value. */
  onCommit?: (v: number) => void;
  disabled: boolean;
  /** Holds the switch where it is, for a metric the scaler always needs or can never use. */
  toggleLocked?: boolean;
  /** Shown in place of the utilization caption, e.g. why the metric is unavailable. */
  note?: string;
}

/** A utilization-threshold metric: an on/off switch and its target percentage. */
export default function ThresholdSlider({ label, enabled, value, min, max, onToggle, onChange, onCommit, disabled, toggleLocked, note }: ThresholdSliderProps): JSX.Element {
  return (
    <Paper variant="outlined" sx={panelSx}>
      <FormControlLabel control={<Switch checked={enabled} onChange={(e) => onToggle(e.target.checked)} disabled={disabled || toggleLocked} />} label={label} />
      <Box sx={sliderBoxSx(enabled)}>
        <Slider value={value} min={min} max={max} onChange={(_e, v) => onChange(v as number)} onChangeCommitted={(_e, v) => onCommit?.(v as number)} disabled={disabled || !enabled} valueLabelDisplay="auto" />
        <Typography variant="caption" color="text.secondary">
          {note ?? `${value}% utilization`}
        </Typography>
      </Box>
    </Paper>
  );
}
