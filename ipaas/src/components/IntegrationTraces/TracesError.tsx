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

import { Button, Paper, Stack, Typography } from '@wso2/oxygen-ui';
import { AlertTriangle, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import * as styles from './IntegrationTraces.styles';

interface TracesErrorProps {
  title: string;
  onRetry: () => void;
}

/** A failed trace query, laid out as the Runtime Logs page shows a failed log query. */
export default function TracesError({ title, onRetry }: TracesErrorProps): JSX.Element {
  return (
    <Paper variant="outlined" sx={styles.card}>
      <Stack sx={styles.errorState}>
        <AlertTriangle size={48} style={styles.errorIcon} />
        <Typography variant="h3" textAlign="center">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={styles.errorDescription}>
          The tracing service is temporarily unavailable. Please try again in a moment.
        </Typography>
        <Button variant="outlined" size="small" startIcon={<RefreshCw size={14} />} onClick={onRetry} sx={styles.errorRetry}>
          Retry
        </Button>
      </Stack>
    </Paper>
  );
}
