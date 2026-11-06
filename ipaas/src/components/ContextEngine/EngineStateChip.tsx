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

import { Chip, Tooltip } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { ContextEngineState } from '../../types/contextEngine';

const COLOR: Record<ContextEngineState, 'success' | 'info' | 'error' | 'warning' | 'default'> = {
  ready: 'success',
  provisioning: 'info',
  starting: 'info',
  failed: 'error',
  deleting: 'warning',
  unknown: 'default',
};

const LABEL: Record<ContextEngineState, string> = {
  ready: 'Running',
  provisioning: 'Provisioning',
  starting: 'Starting',
  failed: 'Failed',
  deleting: 'Deleting',
  unknown: 'Status unavailable',
};

/** Engine lifecycle state as a small outlined chip, with the BFF's reason, when it gives one, on hover. */
export default function EngineStateChip({ state, reason }: { state: ContextEngineState | string; reason?: string }): JSX.Element {
  const known = state in COLOR ? (state as ContextEngineState) : null;
  const chip = <Chip size="small" variant="outlined" color={known ? COLOR[known] : 'default'} label={known ? LABEL[known] : state} />;
  return reason ? (
    <Tooltip title={reason}>
      <span>{chip}</span>
    </Tooltip>
  ) : (
    chip
  );
}
