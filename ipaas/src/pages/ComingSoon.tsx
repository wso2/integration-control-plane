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

import { Box, Button, PageContent, Stack, Typography, type SxProps, type Theme } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { artSx, descriptionSx, inlineArtSx, inlineSx, pageSx, textStackSx } from './ComingSoon.styles';

const HEADING = 'Coming soon';

interface ComingSoonProps {
  /** Overrides the heading for states that aren't literally "coming soon". */
  title?: string;
  description?: string;
}

/** The illustration: the wait itself, a dotted ring drifting round a clock whose second hand sweeps. */
function ClockArt({ sx }: { sx: SxProps<Theme> }): JSX.Element {
  return (
    <Box sx={sx}>
      <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="auto" role="img" aria-label="A clock, waiting">
        {/* Concentric wash */}
        <circle cx="100" cy="100" r="92" fill="currentColor" fillOpacity="0.04" />
        <circle cx="100" cy="100" r="74" fill="currentColor" fillOpacity="0.05" />

        {/* Drifting dotted frame */}
        <circle className="cs-ring" cx="100" cy="100" r="84" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.5 7" />

        {/* Progress track, then the part already elapsed */}
        <circle cx="100" cy="100" r="66" stroke="currentColor" strokeOpacity="0.09" strokeWidth="7" />
        <path d="M 100 34 A 66 66 0 0 1 133 157.2" stroke="currentColor" strokeOpacity="0.85" strokeWidth="7" strokeLinecap="round" />

        {/* Face */}
        <circle cx="100" cy="100" r="52" fill="var(--oxygen-palette-background-paper, #fff)" />

        {/* Quarter ticks */}
        <g stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" strokeLinecap="round">
          <line x1="100" y1="56" x2="100" y2="64" />
          <line x1="144" y1="100" x2="136" y2="100" />
          <line x1="100" y1="144" x2="100" y2="136" />
          <line x1="56" y1="100" x2="64" y2="100" />
        </g>

        {/* Hour and minute hands */}
        <g stroke="var(--oxygen-palette-text-primary, #3c4043)" strokeOpacity="0.8" strokeLinecap="round">
          <line x1="100" y1="100" x2="100" y2="72" strokeWidth="4" />
          <line x1="100" y1="100" x2="128" y2="128" strokeWidth="3.5" />
        </g>

        {/* Sweeping second hand */}
        <line className="cs-second" x1="100" y1="100" x2="62" y2="78" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

        {/* Spindle */}
        <circle cx="100" cy="100" r="5" fill="var(--oxygen-palette-background-paper, #fff)" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    </Box>
  );
}

/**
 * "Coming soon" for a panel inside a page: smaller, and with no way back since the page stays. `action` offers what
 * can be done meanwhile.
 */
export function ComingSoonInline({ title = HEADING, description, action }: { title?: string; description: string; action?: ReactNode }): JSX.Element {
  return (
    <Stack alignItems="center" gap={1.5} sx={inlineSx}>
      <ClockArt sx={inlineArtSx} />
      <Typography variant="h6" fontWeight={600}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={descriptionSx}>
        {description}
      </Typography>
      {action}
    </Stack>
  );
}

export default function ComingSoon({ title = HEADING, description = 'This feature is currently under development. Check back soon!' }: ComingSoonProps): JSX.Element {
  const navigate = useAppNavigate();

  return (
    <PageContent fullWidth sx={pageSx}>
      <Stack alignItems="center" gap={3} sx={textStackSx}>
        {/* Illustration: the wait itself — a dotted ring drifting round a clock whose second
            hand sweeps. Sized tight to the art so the text sits close beneath it. */}
        <ClockArt sx={artSx} />

        <Stack alignItems="center" gap={0.75}>
          <Typography variant="h4" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={descriptionSx}>
            {description}
          </Typography>
        </Stack>

        <Button variant="outlined" startIcon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>
          Go back
        </Button>
      </Stack>
    </PageContent>
  );
}
