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

import { Box, Button, CircularProgress, Typography } from '@wso2/oxygen-ui';
import { Check, Play } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { checklistDotSx, checklistSx, checklistStepSx, mutedSx } from '../styles';
import type { GetStartedStep, GetStartedStepId } from '../../../types/contextEngine';

interface GetStartedChecklistProps {
  steps: GetStartedStep[];
  /** A build is running — the Build action shows progress instead of a button. */
  building?: boolean;
  onAction: (id: GetStartedStepId) => void;
}

const ACTION_LABEL: Record<GetStartedStepId, string> = { build: 'Build now', ask: 'Open Playground', publish: 'Publish', grant: 'Manage access' };

/** Four first-run steps in a row; the current one carries its action. */
export default function GetStartedChecklist({ steps, building = false, onAction }: GetStartedChecklistProps): JSX.Element {
  return (
    <Box sx={checklistSx} role="list" aria-label="Get started">
      {steps.map((step, i) => (
        <Box key={step.id} sx={{ ...checklistStepSx, opacity: step.state === 'todo' ? 0.7 : 1 }} role="listitem">
          <Box sx={checklistDotSx(step.state)} aria-hidden="true">
            {step.state === 'done' ? <Check size={14} /> : i + 1}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: step.state === 'current' ? 600 : 500 }}>
              {step.title}
            </Typography>
            <Typography variant="caption" sx={{ ...mutedSx, display: 'block', lineHeight: 1.45 }}>
              {step.description}
            </Typography>
            {step.state === 'current' && (
              <Button
                size="small"
                variant="contained"
                disabled={step.id === 'build' && building}
                startIcon={step.id === 'build' ? building ? <CircularProgress size={12} color="inherit" /> : <Play size={14} /> : undefined}
                onClick={() => onAction(step.id)}
                sx={{ mt: 1 }}>
                {step.id === 'build' && building ? 'Building…' : ACTION_LABEL[step.id]}
              </Button>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
