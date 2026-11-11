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

import { Alert, Box, Button, CircularProgress, Typography } from '@wso2/oxygen-ui';
import { useEffect, useState, type JSX } from 'react';
import { CREATION_STEPS, CREATION_STEP_INTERVAL } from '../constants/integrationCreation';
import type { CreationStep } from '../constants/integrationCreation';

interface IntegrationCreationLoaderProps {
  /** Integration type shown in the heading, e.g. "Automation", "Integration as API", "Integration" */
  label: string;
  subLabel?: string;
  isPending: boolean;
  isSuccess: boolean;
  error?: string | null;
  /** A plan limit is a boundary rather than a malfunction, so callers pass 'warning' for quota. */
  errorSeverity?: 'error' | 'warning';
  onBack?: () => void;
  /**
   * The flow's own progress (0–100) and current step, for a caller that tracks them.
   * Without them the loader steps through its standard creation stages on a timer.
   */
  progress?: number;
  stepLabel?: string;
  steps?: CreationStep[];
  successText?: string;
}

export default function IntegrationCreationLoader({
  label,
  subLabel,
  isPending,
  isSuccess,
  error,
  errorSeverity = 'error',
  onBack,
  progress,
  stepLabel,
  steps = CREATION_STEPS,
  successText = 'Integration created!',
}: IntegrationCreationLoaderProps): JSX.Element {
  const [timedStep, setCreationStep] = useState<CreationStep>(steps[0]);
  const creationStep: CreationStep = progress !== undefined && !isSuccess ? { progress, text: stepLabel || timedStep.text } : timedStep;

  useEffect(() => {
    if (!isPending) return;
    setCreationStep(steps[0]);
    const timers = steps.slice(1).map((step, i) => setTimeout(() => setCreationStep(step), (i + 1) * CREATION_STEP_INTERVAL));
    return () => timers.forEach(clearTimeout);
  }, [isPending, steps]);

  useEffect(() => {
    if (isSuccess) setCreationStep({ progress: 100, text: successText });
  }, [isSuccess, successText]);

  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: 3,
        }}>
        <Alert severity={errorSeverity} sx={{ maxWidth: 480, width: '100%' }}>
          {error}
        </Alert>
        {onBack && (
          <Button variant="outlined" onClick={onBack}>
            Go back
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        gap: 3,
      }}>
      <Typography variant="h2">Setting up your {label}…</Typography>

      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <CircularProgress variant="determinate" value={creationStep.progress} size={80} thickness={4} style={{ color: 'var(--oxygen-palette-primary-main)' }} />
        <Box
          sx={{
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Typography variant="caption" component="div" color="text.secondary">
            {creationStep.progress}%
          </Typography>
        </Box>
      </Box>

      <Typography color="text.secondary" variant="body2">
        {creationStep.text}
      </Typography>
      {subLabel && (
        <Typography color="text.secondary" variant="h4">
          {subLabel}
        </Typography>
      )}
    </Box>
  );
}
