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

import { Button, CircularProgress, MenuItem, Select, Stack } from '@wso2/oxygen-ui';
import { RefreshCw } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import EnvironmentSelect from '../common/EnvironmentSelect';
import { TIME_PRESETS } from '../../utils/logs';
import * as styles from './IntegrationTraces.styles';

interface TracesToolbarProps {
  environments: { id: string; name: string }[];
  environmentId: string;
  onEnvironmentChange: (environmentId: string) => void;
  rangeHours: number;
  onRangeChange: (hours: number) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export default function TracesToolbar({ environments, environmentId, onEnvironmentChange, rangeHours, onRangeChange, onRefresh, refreshing }: TracesToolbarProps): JSX.Element {
  return (
    <Stack direction="row" sx={styles.toolbar}>
      <EnvironmentSelect environments={environments} value={environmentId} onChange={onEnvironmentChange} />
      <Select size="small" value={rangeHours} onChange={(e) => onRangeChange(Number(e.target.value))} sx={styles.rangeSelect} inputProps={{ 'aria-label': 'Time range' }}>
        {TIME_PRESETS.map((p) => (
          <MenuItem key={p.label} value={p.hours}>
            {p.label}
          </MenuItem>
        ))}
      </Select>
      <Button variant="outlined" size="small" onClick={onRefresh} disabled={refreshing} startIcon={refreshing ? <CircularProgress size={14} /> : <RefreshCw size={14} />}>
        Refresh
      </Button>
    </Stack>
  );
}
