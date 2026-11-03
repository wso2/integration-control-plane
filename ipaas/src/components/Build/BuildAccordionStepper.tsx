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

import { Box, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { BuildRunLogs } from '../../types/build';
import { BUILD_STAGES, STEPPER_ICON_COL, STEPPER_ICON_PY, STEPPER_ICON_SIZE, STEPPER_LINE_BOTTOM_EXT, STEPPER_LINE_TOP } from '../../constants/build';
import { getStepStatus } from '../../utils/build';
import { StageIcon, SubStepIcon } from '../StatusIcons';

interface BuildAccordionStepperProps {
  logs: BuildRunLogs;
  isInProgress?: boolean;
}

export default function BuildAccordionStepper({ logs, isInProgress }: BuildAccordionStepperProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const { key } of BUILD_STAGES) {
      if (key === 'build') continue;
      if (isInProgress || getStepStatus(logs, key) !== 'pending') initial.add(key);
    }
    return initial;
  });

  const initStatus = getStepStatus(logs, 'init');
  const deployStatus = getStepStatus(logs, 'deploy');

  // Auto-expand a stage when it becomes active
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (initStatus === 'active') next.add('init');
      if (deployStatus === 'active') next.add('deploy');
      return next.size === prev.size ? prev : next;
    });
  }, [initStatus, deployStatus]);

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const hadUnitTest = logs.build?.steps.some((s) => s.name === 'Unit Test') ?? false;

  return (
    <Stack sx={{ background: 'transparent' }}>
      {BUILD_STAGES.map(({ key, label: defaultLabel }, stageIndex) => {
        const stageKey = key as 'init' | 'build' | 'deploy';
        const isLast = stageIndex === BUILD_STAGES.length - 1;
        const stage = logs[stageKey];
        const status = getStepStatus(logs, stageKey);
        const steps = stage?.steps ?? [];
        const isBuild = key === 'build';
        const hasSubSteps = !isBuild && steps.length > 0;
        const isExpanded = expanded.has(key);
        const showSubs = hasSubSteps && isExpanded;
        const label = isBuild && !hadUnitTest ? 'Build Source' : defaultLabel;

        return (
          <Box key={key} sx={{ position: 'relative', pb: (hasSubSteps && !isExpanded) || isBuild ? 1.5 : 0 }}>
            {/* Connector line */}
            {(!isLast || showSubs) && (
              <Box
                sx={{
                  position: 'absolute',
                  left: STEPPER_ICON_COL / 2 - 1,
                  top: STEPPER_LINE_TOP,
                  bottom: isLast ? 8 : -STEPPER_LINE_BOTTOM_EXT,
                  width: 2,
                  bgcolor: 'divider',
                  zIndex: 0,
                }}
              />
            )}

            {/* Stage header row */}
            <Stack
              direction="row"
              alignItems="center"
              onClick={hasSubSteps ? () => toggleExpand(key) : undefined}
              onKeyDown={hasSubSteps ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(key); } } : undefined}
              {...(hasSubSteps ? { role: 'button', tabIndex: 0, 'aria-expanded': isExpanded, 'aria-controls': `substeps-${key}` } : {})}
              sx={{
                cursor: hasSubSteps ? 'pointer' : 'default',
                userSelect: 'none',
                borderRadius: 1,
                '&:hover': hasSubSteps ? { bgcolor: 'action.hover' } : undefined,
                '&:focus-visible': hasSubSteps ? { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } : undefined,
              }}
            >
              <Box
                sx={{
                  width: STEPPER_ICON_COL,
                  flexShrink: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  py: STEPPER_ICON_PY / 8,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <StageIcon status={status} size={STEPPER_ICON_SIZE} />
              </Box>

              <Stack direction="row" alignItems="center" sx={{ flex: 1, py: STEPPER_ICON_PY / 8, pr: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, flexGrow: 1 }}>
                  {label}
                </Typography>

                {hasSubSteps && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      color: 'text.secondary',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      ml: 0.5,
                    }}
                  >
                    <ChevronDown size={14} />
                  </Box>
                )}
              </Stack>
            </Stack>

            {/* Sub-step rows */}
            {showSubs && (
              <Stack id={`substeps-${key}`} sx={{ pt: 1.5, pb: 1.5 }}>
                {steps.map((step, i) => {
                  const isSkipped = step.conclusion?.toLowerCase() === 'skipped';
                  const isStepActive = step.status === 'in_progress';
                  return (
                    <Stack key={step.number ?? i} direction="row" alignItems="center">
                      <Box
                        sx={{
                          width: STEPPER_ICON_COL,
                          flexShrink: 0,
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          py: 0.6,
                          position: 'relative',
                          zIndex: 1,
                        }}
                      >
                        <SubStepIcon step={step} />
                      </Box>

                      <Tooltip title={isSkipped ? 'Skipped' : undefined}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.78rem',
                            py: 0.6,
                            color: isStepActive ? 'text.primary' : 'text.secondary',
                            fontWeight: isStepActive ? 500 : 400,
                            opacity: isSkipped ? 0.5 : 1,
                          }}
                        >
                          {step.name}
                        </Typography>
                      </Tooltip>
                    </Stack>
                  );
                })}
              </Stack>
            )}

          </Box>
        );
      })}
    </Stack>
  );
}
