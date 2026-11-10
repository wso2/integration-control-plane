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

import { Alert, Box, Button, CircularProgress, type Theme } from '@wso2/oxygen-ui';
import { ArrowUpRight } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { WorkflowNotice } from '../connection/workflowCredential';
import type { WorkflowNoticeAction } from '../connection/useWorkflowConnection';

interface TestKeyNoticeProps {
  notice: WorkflowNotice;
  /** What can be done about it here, such as switching the endpoint to API key, trying again, or opening the User Portal. */
  action?: WorkflowNoticeAction | null;
}

// The action sits under the text rather than in the alert's action column, which would squeeze a long
// notice into a narrow env card.
const actionRowSx = { mt: 1.5 } as const;

// A filled button in the notice's own colour. A link's arrow lifts toward the corner on hover, the way the
// page it opens leaves this one.
const actionSx = {
  fontWeight: 600,
  boxShadow: 'none',
  '& .MuiButton-endIcon': { transition: 'transform 150ms ease-out' },
  '&:hover': { boxShadow: 'none' },
  '&:hover .MuiButton-endIcon': { transform: (theme: Theme) => `translate(${theme.spacing(0.25)}, ${theme.spacing(-0.25)})` },
  '@media (prefers-reduced-motion: reduce)': { '& .MuiButton-endIcon': { transition: 'none' } },
} as const;

/**
 * Stands in for a workflow view the console cannot reach the management API for: the gateway has
 * not exposed it yet, holds no test key the console may use, the integration does not serve it, or the
 * workflow is published to the User Portal (`WorkflowConnection`'s `unavailable` state). Worded and
 * styled as the Test Console's notice for an endpoint it cannot test.
 */
export default function TestKeyNotice({ notice, action }: TestKeyNoticeProps): JSX.Element {
  // A page opens in a new tab; anything else runs here, held while it does.
  const kind = !action
    ? null
    : 'href' in action
      ? { href: action.href, target: '_blank', rel: 'noopener noreferrer', endIcon: <ArrowUpRight size={16} /> }
      : { onClick: action.run, disabled: action.pending, startIcon: action.pending ? <CircularProgress size={14} color="inherit" /> : undefined };
  return (
    <Alert severity={notice.severity}>
      {notice.text}
      {action && kind && (
        <Box sx={actionRowSx}>
          <Button variant="contained" color={notice.severity} size="small" sx={actionSx} {...kind}>
            {action.label}
          </Button>
        </Box>
      )}
    </Alert>
  );
}
