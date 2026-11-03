/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
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
