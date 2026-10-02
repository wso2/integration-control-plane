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

import { Box, Chip, CircularProgress, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CircleAlert } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useDeletionJob } from '../../hooks/useContextEngine';
import { deletionFailureText } from '../../utils/contextEngine';
import { formatDistanceToNow } from '../../utils/time';
import EngineStateChip from './EngineStateChip';

/**
 * An engine's state for the listing. While it is deleting, the job started from
 * this browser says when it began, or that it failed, in which case the engine
 * kept itself and its data until deletion is tried again.
 */
export default function DeletionStatus({ engineId, state }: { engineId: string; state: string }): JSX.Element {
  const deleting = state === 'deleting';
  const job = useDeletionJob(engineId, deleting);
  if (!deleting) return <EngineStateChip state={state} />;
  if (job.data?.state === 'failed') {
    return (
      <Tooltip title={deletionFailureText(job.data.error?.code)}>
        <Chip size="small" variant="outlined" color="error" icon={<CircleAlert size={14} />} label="Deletion failed" />
      </Tooltip>
    );
  }
  return (
    <Box>
      <Chip size="small" variant="outlined" color="warning" icon={<CircularProgress size={11} color="inherit" />} label="Deleting" />
      {job.data?.createdAt && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Started {formatDistanceToNow(job.data.createdAt).toLowerCase()}
        </Typography>
      )}
    </Box>
  );
}
