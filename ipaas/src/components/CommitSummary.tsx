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

import { Box, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { GitCommit } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

const rowSx = { minWidth: 0, cursor: 'default' } as const;
const iconSx = { display: 'inline-flex', color: 'text.primary', flexShrink: 0 } as const;
const shaSx = { fontFamily: 'monospace', flexShrink: 0 } as const;
// Measured in characters, so every card cuts the message at the same length.
const messageSx = { maxWidth: '20ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

/** A card header's commit: icon, short SHA and the message cut to one line, the same on every card. */
export default function CommitSummary({ sha, message, tooltip }: { sha: string; message?: string; tooltip?: string }): JSX.Element {
  const row = (
    <Stack direction="row" alignItems="center" gap={0.5} sx={rowSx}>
      <Box component="span" aria-hidden="true" sx={iconSx}>
        <GitCommit size={16} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={shaSx}>
        {sha.slice(0, 7)}
      </Typography>
      {message && (
        <Typography variant="body2" color="text.secondary" sx={messageSx}>
          {message}
        </Typography>
      )}
    </Stack>
  );
  return tooltip ? (
    <Tooltip title={tooltip} placement="bottom">
      {row}
    </Tooltip>
  ) : (
    row
  );
}
