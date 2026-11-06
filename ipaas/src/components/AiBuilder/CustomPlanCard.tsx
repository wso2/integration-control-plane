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

import { Box, Button, Typography } from '@wso2/oxygen-ui';
import { Send } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { AiIntegrationPlanStep, CustomIntegrationResponse } from '../../types/aiBuilder';
import { ResponseCard } from './ResponseCard';
import { renderBold } from './renderBold';
import { PLAN_STEP_CONNECTOR_SX, PLAN_STEP_NUMBER_SX } from './styles';

function PlanStep({ step, index, isLast }: { step: AiIntegrationPlanStep; index: number; isLast: boolean }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <Box sx={PLAN_STEP_NUMBER_SX}>{index + 1}</Box>
        {!isLast && <Box sx={PLAN_STEP_CONNECTOR_SX} />}
      </Box>
      <Box sx={{ flex: 1, pb: isLast ? 0 : 2.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
          {step.title}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
          {step.description}
        </Typography>
      </Box>
    </Box>
  );
}

export function CustomPlanCard({ response, onOpenEditor }: { response: CustomIntegrationResponse; onOpenEditor?: () => void }): JSX.Element {
  return (
    <ResponseCard
      actions={
        onOpenEditor && (
          <Button variant="contained" color="primary" size="small" endIcon={<Send size={14} />} onClick={onOpenEditor}>
            Generate &amp; open in editor
          </Button>
        )
      }>
      {response.message && (
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {renderBold(response.message)}
        </Typography>
      )}

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
          {response.title}
        </Typography>

        {response.steps.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {response.steps.map((step, index) => (
              <PlanStep key={index} step={step} index={index} isLast={index === response.steps.length - 1} />
            ))}
          </Box>
        )}
      </Box>
    </ResponseCard>
  );
}
