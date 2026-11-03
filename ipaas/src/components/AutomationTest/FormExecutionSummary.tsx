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

import { Alert, Box, Button, Divider, Link, PageTitle, Stack, Tooltip, Typography, RelativeTime } from '@wso2/oxygen-ui';
import { GitCommit, History, Plus, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { formatDateTime, formatDistanceToNow } from '../../utils/time';
import { RUNTIME_ARGS_DOC_URL } from '../../constants/docs';

interface FormExecutionSummaryProps {
  commitSha: string;
  buildDate?: string;
  onNewTest: () => void;
  newTestDisabled: boolean;
  onExecutions: () => void;
  onRefresh: () => void;
  refreshDisabled: boolean;
}

/**
 * The Test page header — title, the New Test / Executions / Refresh actions, the
 * runtime-arguments info banner, and the "Current Build" commit + age line. Mirrors
 * Devant's FormExecutionSummary layout.
 */
export default function FormExecutionSummary({ commitSha, buildDate, onNewTest, newTestDisabled, onExecutions, onRefresh, refreshDisabled }: FormExecutionSummaryProps): JSX.Element {
  return (
    <Box sx={{ width: '100%' }}>
      <PageTitle>
        <PageTitle.Header>Test Your Automation</PageTitle.Header>
        <PageTitle.Actions>
          <Tooltip title="Create new test">
            <span>
              <Button variant="text" size="small" startIcon={<Plus size={16} />} disabled={newTestDisabled} onClick={onNewTest}>
                New test
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="View executions">
            <Button variant="text" size="small" startIcon={<History size={16} />} onClick={onExecutions}>
              Executions
            </Button>
          </Tooltip>
          <Tooltip title="Refresh test">
            <span>
              <Button variant="text" size="small" startIcon={<RefreshCw size={16} />} disabled={refreshDisabled} onClick={onRefresh}>
                Refresh
              </Button>
            </span>
          </Tooltip>
        </PageTitle.Actions>
      </PageTitle>

      <Alert severity="info" variant="outlined" sx={{ my: 2 }}>
        You can configure runtime arguments to provide structured input validation. Learn more in the{' '}
        <Link href={RUNTIME_ARGS_DOC_URL} target="_blank" rel="noopener noreferrer">
          documentation.
        </Link>
      </Alert>

      <Stack direction="row" alignItems="center" gap={2} sx={{ color: 'text.secondary' }}>
        <Typography variant="caption">Current Build:</Typography>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <GitCommit size={14} />
          <Typography variant="body2" color="text.secondary">
            {commitSha ? commitSha.slice(0, 9) : '--'}
          </Typography>
        </Stack>
        {buildDate ? (
          <RelativeTime time={formatDistanceToNow(buildDate)} dateTime={buildDate} tooltip={formatDateTime(buildDate)} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            --
          </Typography>
        )}
      </Stack>

      <Divider sx={{ mt: 2 }} />
    </Box>
  );
}
