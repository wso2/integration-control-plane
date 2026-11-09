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

import { Box, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { CircleCheck, CircleX, Clock } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { Step, StepStatus } from '../types/stepper';
import type { BuildTone } from '../utils/buildProgress';

const TONE_COLOR: Record<BuildTone, 'warning' | 'success' | 'error' | null> = { running: 'warning', success: 'success', error: 'error', neutral: null };

const SEGMENT_COLOR: Partial<Record<StepStatus, string>> = {
  success: 'success.main',
  inProgress: 'warning.main',
  failed: 'error.main',
};

const pillSx = { flexShrink: 0 } as const;

const segmentSx = (status: StepStatus) =>
  ({
    width: 36,
    height: 6,
    borderRadius: 3,
    bgcolor: SEGMENT_COLOR[status] ?? 'divider',
    ...(status === 'inProgress' && {
      '@keyframes buildPillPulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
      animation: 'buildPillPulse 1.4s ease-in-out infinite',
    }),
  }) as const;

// A text line's box keeps room above the capitals and below the baseline, so a label like
// "Completed" (no descenders) sits higher than its box's centre and the segments beside it look low.
// Trimming the box to the capitals and the baseline lets the row centre what you see. Browsers
// without text-box trimming fall back to a line height of 1, which gets most of the way.
const textSx = { lineHeight: 1, textBox: 'trim-both cap alphabetic' } as const;
const labelSx = { ...textSx, fontWeight: 500 } as const;

const iconSx = (tone: BuildTone) => ({ display: 'inline-flex', color: TONE_COLOR[tone] ? `${TONE_COLOR[tone]}.main` : 'text.secondary' }) as const;

interface BuildStatusPillProps {
  tone: BuildTone;
  /** What the build is doing or how it ended: "In progress", "Completed", "Failed while building the image". */
  label: string;
  /** The build's stages, once known. While it runs, the pill names the stage it is on in place of `label`. */
  steps?: Step[];
}

/**
 * The latest build's status in its card header: an icon in the build's colour and a label,
 * with one segment per stage while it runs or once it has failed. While the build runs it names the
 * stage it is on and how far along it is ("Build source & test ▬▬▭ 2/3").
 */
export default function BuildStatusPill({ tone, label, steps }: BuildStatusPillProps): JSX.Element {
  const current = tone === 'running' && steps ? steps.findIndex((s) => s.status === 'inProgress') : -1;
  const text = current === -1 || !steps ? label : steps[current].label;
  // The accessible name always leads with the status ("In progress", "Completed", "Failed while…"),
  // even while the visible text names a stage: screen readers hear it first, and the e2e suite reads
  // the build's status from it (tests/e2e/helpers/build.ts).
  const spoken = current === -1 || !steps ? label : `${label}: ${text}, stage ${current + 1} of ${steps.length}`;
  // The segments say how far a build got: while it runs, and where a failed one broke. A completed
  // build got all the way, which "Completed" already says.
  const showSegments = !!steps && (tone === 'running' || tone === 'error');

  return (
    <Stack direction="row" alignItems="center" gap={1.25} role="img" aria-label={spoken} sx={pillSx}>
      <Box component="span" aria-hidden="true" sx={iconSx(tone)}>
        {tone === 'running' ? <CircularProgress size={14} color="warning" /> : tone === 'success' ? <CircleCheck size={16} /> : tone === 'error' ? <CircleX size={16} /> : <Clock size={16} />}
      </Box>
      <Typography variant="body2" color="text.primary" sx={labelSx} aria-hidden="true">
        {text}
      </Typography>
      {showSegments && (
        <Stack direction="row" gap={0.5} aria-hidden="true">
          {steps.map((step) => (
            <Box key={step.id} sx={segmentSx(step.status)} />
          ))}
        </Stack>
      )}
      {current !== -1 && steps && (
        <Typography variant="body2" color="text.secondary" sx={textSx} aria-hidden="true">
          {current + 1}/{steps.length}
        </Typography>
      )}
    </Stack>
  );
}
