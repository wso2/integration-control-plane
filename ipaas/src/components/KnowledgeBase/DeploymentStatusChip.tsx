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

const STATUS: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  CREATING: { label: 'Creating', color: 'warning' },
  FAILED: { label: 'Failed', color: 'error' },
  ACTIVE: { label: 'Active', color: 'success' },
  IN_PROGRESS: { label: 'Deploying', color: 'warning' },
  ERROR: { label: 'Failed', color: 'error' },
  SUSPENDED: { label: 'Stopped', color: 'default' },
};

/** A deployment status as a chip; '' is a deployment that has not started reporting yet. A failed create's reason shows on hover. */
export default function DeploymentStatusChip({ status, error }: { status: string; error?: string }): JSX.Element {
  const s = STATUS[status] ?? { label: 'Deploying', color: 'warning' as const };
  const chip = <Chip size="small" variant="outlined" label={s.label} color={s.color} />;
  return error ? (
    <Tooltip title={error}>
      <span>{chip}</span>
    </Tooltip>
  ) : (
    chip
  );
}
