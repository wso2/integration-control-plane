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
import type { JSX, ReactNode } from 'react';

interface DetailRowProps {
  label: string;
  children: ReactNode;
  /** Width of the label column. */
  labelWidth?: number;
  /** Optional trailing action (e.g. an Edit button) aligned to the row's end. */
  action?: ReactNode;
}

/** A labelled key/value row used in the server-detail cards. */
export default function DetailRow({ label, children, labelWidth = 160, action }: DetailRowProps): JSX.Element {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={{ xs: 0.5, sm: 2 }} sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: labelWidth, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>{children}</Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Stack>
  );
}
