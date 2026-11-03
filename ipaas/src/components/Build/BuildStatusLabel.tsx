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

import { Stack, Typography } from '@wso2/oxygen-ui';
import { FailedIcon, InProgressIcon, QueuedIcon, SuccessIcon, WarningIcon } from '../StatusIcons';

interface BuildStatusLabelProps {
  status: string;
  conclusion: string;
}

export default function BuildStatusLabel({ status, conclusion }: BuildStatusLabelProps) {
  if (status === 'queued') {
    return (
      <Stack direction="row" alignItems="center" gap={0.75}>
        <QueuedIcon size={16} />
        <Typography variant="body2">Queued</Typography>
      </Stack>
    );
  }
  if (status === 'in_progress') {
    return (
      <Stack direction="row" alignItems="center" gap={0.75}>
        <InProgressIcon size={16} />
        <Typography variant="body2">In Progress</Typography>
      </Stack>
    );
  }
  if (status === 'completed') {
    if (conclusion === 'success') {
      return (
        <Stack direction="row" alignItems="center" gap={0.75}>
          <SuccessIcon size={16} />
          <Typography variant="body2">Success</Typography>
        </Stack>
      );
    }
    if (conclusion === 'warning') {
      return (
        <Stack direction="row" alignItems="center" gap={0.75}>
          <WarningIcon size={16} />
          <Typography variant="body2">Warning</Typography>
        </Stack>
      );
    }
    if (conclusion === 'failure' || conclusion === 'failed') {
      return (
        <Stack direction="row" alignItems="center" gap={0.75}>
          <FailedIcon size={16} />
          <Typography variant="body2">Failed</Typography>
        </Stack>
      );
    }
  }
  return <Typography variant="body2">{status}</Typography>;
}
