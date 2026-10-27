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

import { Chip, Stack } from '@wso2/oxygen-ui';
import { Check, Circle } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { ContextEngineExposure } from '../../types/contextEngine';

const offSx = { opacity: 0.6 } as const;

/** Two small pills saying whether the REST API and the MCP server are published. */
export default function ExposurePills({ exposure }: { exposure: ContextEngineExposure }): JSX.Element {
  const pill = (label: string, on: boolean) => (
    <Chip size="small" variant="outlined" color={on ? 'success' : 'default'} icon={on ? <Check size={12} /> : <Circle size={10} />} label={label} sx={on ? undefined : offSx} aria-label={`${label} ${on ? 'published' : 'not published'}`} />
  );
  return (
    <Stack direction="row" gap={0.75}>
      {pill('API', exposure.api)}
      {pill('MCP', exposure.mcp)}
    </Stack>
  );
}
