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

import { Box } from '@wso2/oxygen-ui';
import { Bot, CalendarClock, Workflow } from '@wso2/oxygen-ui-icons-react';
import type { IntegrationKind } from '../types/portal';

const ICONS = { aiAgent: Bot, automation: CalendarClock, workflow: Workflow } as const;

/** The tinted type badge the integration console shows wherever an integration is listed or headlined. */
export default function IntegrationIcon({ kind, size = 32 }: { kind: IntegrationKind; size?: number }) {
  const Icon = ICONS[kind];
  return (
    <Box sx={{ width: size, height: size, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, bgcolor: 'action.selected', color: 'primary.main' }}>
      <Icon size={Math.round(size * 0.55)} />
    </Box>
  );
}
