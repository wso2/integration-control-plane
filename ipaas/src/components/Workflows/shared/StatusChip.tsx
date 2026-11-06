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

import { Chip } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { StatusChipColor } from './workflowStatus';

// The compact status chip the Runtime and deployment-track views use, so a list row stays one line.
const chipSx = { height: 20, fontSize: '0.75rem', fontWeight: 500 } as const;

interface StatusChipProps {
  label: string;
  color: StatusChipColor;
}

/** A status in a list row: the Workflows and Human Tasks tables share this one size. */
export default function StatusChip({ label, color }: StatusChipProps): JSX.Element {
  return <Chip label={label} color={color} variant="outlined" size="small" sx={chipSx} />;
}
