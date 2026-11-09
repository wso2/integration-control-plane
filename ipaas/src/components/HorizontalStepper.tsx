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

import { Step as OxyStep, StepLabel, Stepper, stepConnectorClasses } from '@wso2/oxygen-ui';
import type { JSX, ReactNode } from 'react';
import type { Step, StepperSize, StepStatus } from '../types/stepper';
import { FailedIcon, InProgressIcon, QueuedIcon, SkippedIcon, SuccessIcon } from './StatusIcons';

interface HorizontalStepperProps {
  steps: Step[];
  /** Index of the step to emphasise (scaled icon + bold label). `-1` for none. */
  currentStepIndex: number;
  size?: StepperSize;
  /** Override the size's default vertical padding (px) — e.g. tighter on the Test page. */
  paddingY?: number;
}

interface SizeConfig {
  icon: number;
  label: number;
  paddingY: number;
  paddingX: number;
}

const SIZE_CONFIG: Record<StepperSize, SizeConfig> = {
  xs: { icon: 16, label: 12, paddingY: 8, paddingX: 8 },
  s: { icon: 20, label: 13, paddingY: 12, paddingX: 12 },
  m: { icon: 24, label: 14, paddingY: 24, paddingX: 16 },
  l: { icon: 32, label: 16, paddingY: 36, paddingX: 20 },
};

function statusIcon(status: StepStatus, size: number): ReactNode {
  switch (status) {
    case 'success':
      return <SuccessIcon size={size} />;
    case 'failed':
    case 'terminated':
      return <FailedIcon size={size} />;
    case 'skipped':
      return <SkippedIcon size={size} />;
    case 'inProgress':
    case 'queued':
      return <InProgressIcon size={size} />;
    default:
      return <QueuedIcon size={size} />;
  }
}

/** Renders our own status icon (passed via StepLabel's `icon` prop) in place of the default number. */
function CustomStepIcon({ icon }: { icon?: ReactNode }): JSX.Element {
  return <>{icon}</>;
}

/**
 * A resizable horizontal stepper built on the oxygen-ui (MUI) Stepper with `alternativeLabel`
 * layout: our own status icon per step (instead of numbers), labels beneath, joined by the
 * theme's thin connector line, at the chosen `size`. The Automation Test page's TestStepper uses it.
 */
export default function HorizontalStepper({ steps, currentStepIndex, size = 'm', paddingY }: HorizontalStepperProps): JSX.Element {
  const cfg = SIZE_CONFIG[size];

  return (
    <Stepper
      alternativeLabel
      activeStep={currentStepIndex}
      sx={{
        maxWidth: 600,
        mx: 'auto',
        width: '100%',
        py: `${paddingY ?? cfg.paddingY}px`,
        px: `${cfg.paddingX}px`,
        // Align the connector with the (variable-size) icon centre and keep it a thin light line.
        [`& .${stepConnectorClasses.root}`]: { top: `${cfg.icon / 2}px` },
        [`& .${stepConnectorClasses.line}`]: { borderColor: 'divider', borderTopWidth: '1px' },
        '& .MuiStepLabel-label': { fontSize: `${cfg.label}px`, color: 'text.primary', '&.Mui-active': { fontWeight: 500 } },
      }}>
      {steps.map((step, index) => (
        <OxyStep key={step.id}>
          <StepLabel StepIconComponent={CustomStepIcon} icon={statusIcon(step.status, cfg.icon)} sx={{ transition: 'transform 0.3s ease', transform: index === currentStepIndex ? 'scale(1.05)' : 'none' }}>
            {step.label}
          </StepLabel>
        </OxyStep>
      ))}
    </Stepper>
  );
}
