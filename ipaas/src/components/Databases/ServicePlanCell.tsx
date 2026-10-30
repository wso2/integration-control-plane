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

import { Box, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { planLabel, planSpecLine } from '../../utils/databases';
import type { DatabasePlan } from '../../types/databases';

const badgeSx = { height: 20, fontSize: 11, fontWeight: 600 } as const;

interface ServicePlanCellProps {
  planId: string;
  /** The plan's catalog entry; undefined while the offering loads or for a plan no longer offered. */
  plan?: DatabasePlan;
  /** The database's own node count and storage, when the listing carries them. */
  nodeCount?: number;
  storageGi?: number;
}

/** The database list's service plan: plan name with an HA or single-node badge, and its size on one line. */
export default function ServicePlanCell({ planId, plan, nodeCount, storageGi }: ServicePlanCellProps): JSX.Element {
  const nodes = nodeCount ?? plan?.nodeCount;
  const highlyAvailable = nodes !== undefined && nodes > 1;
  const specs = plan ? planSpecLine(plan, storageGi) : '';
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: highlyAvailable ? 'primary.main' : 'text.primary' }}>
          {planLabel(planId)}
        </Typography>
        {nodes !== undefined && <Chip label={highlyAvailable ? 'HA' : 'Single node'} size="small" color={highlyAvailable ? 'primary' : 'default'} variant="outlined" sx={badgeSx} />}
      </Stack>
      {specs && (
        <Typography variant="caption" color="text.secondary">
          {specs}
        </Typography>
      )}
    </Box>
  );
}
