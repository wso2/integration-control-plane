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

import type { ReactNode } from 'react';
import { Box, Chip, Stack, Typography } from '@wso2/oxygen-ui';

interface ResourceRowProps {
  name: string;
  package?: string;
  /** The connection the resource goes through, on its own line. */
  connection?: ReactNode;
  notes?: string[];
  /** A state to stand out, as a label. */
  label?: string;
  action?: ReactNode;
}

const rowSx = { py: 0.75, borderTop: '1px solid', borderColor: 'divider' } as const;
const chipSx = { height: 18, fontSize: '0.65rem', borderRadius: 0.75 } as const;

/** One resource in the Configure form or on the Build card: what it is, the connection, its state, and an action. */
export function ResourceRow({ name, package: pkg, connection, notes = [], label, action }: ResourceRowProps) {
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={rowSx}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap={0.75}>
          <Typography variant="body2">{name}</Typography>
          {pkg && <Chip label={pkg} size="small" variant="outlined" sx={chipSx} />}
          {label && <Chip label={label} size="small" color="warning" variant="outlined" sx={chipSx} />}
        </Stack>
        {connection && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ fontFamily: 'monospace' }}>
            {connection}
          </Typography>
        )}
        {notes.length > 0 && (
          <Typography variant="caption" color="text.secondary" component="div">
            {notes.join(' · ')}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}
