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

import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import { Inbox } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

interface ComplianceEmptyStateProps {
  message: string;
  height?: number;
}

export default function ComplianceEmptyState({ message, height }: ComplianceEmptyStateProps): JSX.Element {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 3, ...(height ? { height } : {}) }}>
      <Box sx={{ color: 'text.disabled', display: 'inline-flex' }}>
        <Inbox size={32} />
      </Box>
      <Typography color="text.secondary">{message}</Typography>
    </Stack>
  );
}
