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

const rowSx = { mb: 2 } as const;
const labelSx = { fontWeight: 500, flexShrink: 0 } as const;
const selectSlotSx = { width: 240, flexShrink: 0 } as const;
const urlsGroupSx = { flex: 1, minWidth: 0 } as const;
const downloadGroupSx = { flexShrink: 0 } as const;

function Label({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Typography variant="body2" color="text.secondary" sx={labelSx}>
      {children}
    </Typography>
  );
}

/** The env card's endpoint row: "Endpoint:", "URLs:" and "Download Spec:", each label beside its value. */
export default function EndpointPanelLayout({ select, urls, download }: { select: ReactNode; urls: ReactNode; download: ReactNode }): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" flexWrap="wrap" columnGap={3} rowGap={1} sx={rowSx}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Label>Endpoint:</Label>
        <Box sx={selectSlotSx}>{select}</Box>
      </Stack>
      <Stack direction="row" alignItems="center" gap={1} sx={urlsGroupSx}>
        <Label>URLs:</Label>
        <Box sx={urlsGroupSx}>{urls}</Box>
      </Stack>
      <Stack direction="row" alignItems="center" gap={0.5} sx={downloadGroupSx}>
        <Label>Download Spec:</Label>
        {download}
      </Stack>
    </Stack>
  );
}
