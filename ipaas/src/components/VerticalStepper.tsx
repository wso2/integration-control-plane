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

import { ButtonBase, Step, StepLabel, Stepper, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

interface VerticalStepperProps {
  /** Ordered step labels. */
  steps: string[];
  /** Index of the current step. May exceed the last index to mark the flow complete. */
  activeStep: number;
  /** When set, completed steps become buttons that jump back to that step. */
  onStepClick?: (index: number) => void;
}

const stepButtonSx = { borderRadius: 1, px: 0.5, mx: -0.5, textAlign: 'left', '&:hover': { textDecoration: 'underline' } } as const;

/**
 * A vertical wizard progress indicator (labels only; content is rendered separately by
 * the caller). Shared by the Prebuilt Integration creation flow and the GenAI register
 * wizard. The current step's label is emphasised; earlier steps show a completed check.
 */
export default function VerticalStepper({ steps, activeStep, onStepClick }: VerticalStepperProps): JSX.Element {
  const lastIndex = steps.length - 1;
  return (
    <Stepper activeStep={activeStep} orientation="vertical" sx={{ '& .MuiStepConnector-line': { minHeight: 30 } }}>
      {steps.map((label, i) => {
        // The last step stays emphasised once reached (there is nothing after it).
        const isCurrent = i === lastIndex ? activeStep >= i : activeStep === i;
        const text = (
          <Typography variant="body2" color={isCurrent ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: isCurrent ? 600 : 400, lineHeight: 1.4 }}>
            {label}
          </Typography>
        );
        const clickable = !!onStepClick && i < activeStep;
        return (
          <Step key={label} completed={activeStep > i}>
            <StepLabel>
              {clickable ? (
                <ButtonBase onClick={() => onStepClick(i)} aria-label={`Go back to ${label}`} sx={stepButtonSx}>
                  {text}
                </ButtonBase>
              ) : (
                text
              )}
            </StepLabel>
          </Step>
        );
      })}
    </Stepper>
  );
}
