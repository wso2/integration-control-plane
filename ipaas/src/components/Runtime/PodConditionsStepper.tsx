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

import { Box, Stack, Tooltip, Typography, RelativeTime } from '@wso2/oxygen-ui';
import { Circle, CircleCheck, HelpCircle } from '@wso2/oxygen-ui-icons-react';
import { useMemo, type JSX } from 'react';
import * as styles from './PodConditionsStepper.styles';
import { POD_CONDITION_DEFINITIONS } from '../../constants/runtime';
import { formatDateTime, formatDistanceToNow } from '../../utils/time';
import type { ClusterPod } from '../../types/runtime';

export default function PodConditionsStepper({ pod }: { pod: ClusterPod | null }): JSX.Element | null {
  const conditions = useMemo(() => {
    const raw = pod?.status?.conditions ?? [];
    return raw.filter((c) => !!POD_CONDITION_DEFINITIONS[c.type]).sort((a, b) => POD_CONDITION_DEFINITIONS[a.type].order - POD_CONDITION_DEFINITIONS[b.type].order);
  }, [pod]);

  if (!conditions.length) return null;

  return (
    <Stack direction="row" alignItems="flex-start" sx={styles.track}>
      {conditions.map((condition) => {
        const info = POD_CONDITION_DEFINITIONS[condition.type];
        const met = condition.status === 'True';
        return (
          <Box key={condition.type} sx={styles.step}>
            <Box sx={styles.iconRow}>
              {/* lucide icons inherit `currentColor`, so the wrapper carries the theme colour. */}
              <Box component="span" sx={styles.icon(met)}>
                {met ? <CircleCheck size={20} fill="currentColor" stroke="#fff" /> : <Circle size={20} />}
              </Box>
            </Box>

            <Stack direction="row" alignItems="center" gap={0.5} sx={styles.label}>
              <Typography variant="subtitle2" align="center">
                {info.displayName}
              </Typography>
              <Tooltip title={info.description}>
                <Box component="span" tabIndex={0} role="note" aria-label={`${info.displayName}: ${info.description}`} sx={styles.helpIcon}>
                  <HelpCircle size={13} />
                </Box>
              </Tooltip>
            </Stack>

            {met && condition.lastTransitionTime ? (
              <RelativeTime time={formatDistanceToNow(condition.lastTransitionTime)} dateTime={condition.lastTransitionTime} tooltip={formatDateTime(condition.lastTransitionTime)} sx={styles.time} />
            ) : (
              <Typography variant="body2" color="text.secondary" align="center" sx={styles.time}>
                —
              </Typography>
            )}

            {condition.message && (
              <Tooltip title={condition.message}>
                <Typography variant="caption" color="text.secondary" align="center" sx={styles.message}>
                  {condition.message}
                </Typography>
              </Tooltip>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
