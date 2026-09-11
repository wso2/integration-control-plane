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

import { Box, Tooltip } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useTimeZone } from '../contexts/TimeZoneContext';
import { formatDateTime, formatDistanceToNow, toIsoUtc } from '../utils/time';

// A timestamp on the chosen clock, with the UTC instant and age in the tooltip; `relative` swaps the two.
export default function DateTime({ value, seconds = true, ms = false, relative = false, mono = true }: { value: string | number | Date | undefined | null; seconds?: boolean; ms?: boolean; relative?: boolean; mono?: boolean }): JSX.Element {
  const { zone, label } = useTimeZone();
  if (value === undefined || value === null || value === '') return <span>—</span>;
  const absolute = formatDateTime(value, { seconds, ms, zone });
  const iso = toIsoUtc(value);
  const ago = formatDistanceToNow(value);
  const text = relative ? ago : absolute;
  const tip = (
    <Box component="span" sx={{ display: 'block', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {relative ? absolute : ago}
      <br />
      {iso}
      <br />
      <Box component="span" sx={{ opacity: 0.75 }}>
        shown in {label}
      </Box>
    </Box>
  );
  return (
    <Tooltip title={tip} enterDelay={400}>
      <Box component="time" dateTime={iso} sx={{ whiteSpace: 'nowrap', ...(mono && { fontVariantNumeric: 'tabular-nums' }) }}>
        {text}
      </Box>
    </Tooltip>
  );
}
