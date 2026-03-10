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

import { Box, CircularProgress, FormControlLabel, Switch, Typography } from '@wso2/oxygen-ui';
import type { SxProps } from '@mui/system';

interface SyncSwitchProps {
  label: string;
  checked: boolean;
  inSync: boolean | null | undefined;
  onChange?: (checked: boolean) => void;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  name?: string;
  labelPlacement?: 'top' | 'start' | 'end' | 'bottom';
  sx?: SxProps;
}

const THUMB_SIZE = 16; // MUI small switch thumb size

const spinnerThumb = (
  <Box sx={{ width: THUMB_SIZE, height: THUMB_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0px 1px 3px rgba(0,0,0,0.3)' }}>
    <CircularProgress size={10} thickness={5} />
  </Box>
);

export default function SyncSwitch({ label, checked, inSync, onChange, onClick, disabled, name, labelPlacement = 'start', sx }: SyncSwitchProps) {
  const syncing = inSync === false;

  return (
    <FormControlLabel
      control={
        <Switch
          name={name}
          size="small"
          checked={checked}
          onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
          onClick={onClick}
          disabled={disabled}
          {...(syncing ? { icon: spinnerThumb, checkedIcon: spinnerThumb } : {})}
        />
      }
      label={<Typography variant="caption" color="text.secondary">{label}</Typography>}
      labelPlacement={labelPlacement}
      sx={{ m: 0, gap: 1, ...sx } as SxProps}
    />
  );
}
