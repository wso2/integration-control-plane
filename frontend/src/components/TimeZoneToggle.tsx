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

import { Button, Tooltip } from '@wso2/oxygen-ui';
import { Clock } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useTimeZone } from '../contexts/TimeZoneContext';
import { localOffsetLabel } from '../utils/time';

// Names the zone the workflow pages' times are on and switches it between local and UTC.
export default function TimeZoneToggle(): JSX.Element {
  const { zone, label, toggle } = useTimeZone();
  const other = zone === 'utc' ? `your local time (${localOffsetLabel()})` : 'UTC';
  return (
    <Tooltip title={`Workflow times are shown in ${label}. Click to show them in ${other}.`}>
      <Button
        size="small"
        variant="text"
        onClick={toggle}
        startIcon={<Clock size={16} />}
        aria-label={`Times shown in ${label}; switch to ${other}`}
        sx={{ color: 'text.secondary', textTransform: 'none', fontVariantNumeric: 'tabular-nums', minWidth: 0, px: 1 }}>
        {zone === 'utc' ? 'UTC' : localOffsetLabel()}
      </Button>
    </Tooltip>
  );
}
