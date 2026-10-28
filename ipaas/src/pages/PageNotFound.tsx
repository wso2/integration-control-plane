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

import { Box, Button, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { orgHomeUrl } from '../paths';
import { actionSx, artSx, fullScreenSx, pageSx, textStackSx } from './PageNotFound.styles';

interface PageNotFoundProps {
  title?: string;
  description?: string;
  /** Where the action button goes. Defaults to the signed-in organization's home, else `/`. */
  actionTo?: string;
  actionLabel?: string;
  /** Fill the viewport, for routes rendered outside the app shell. */
  fullScreen?: boolean;
}

/** The organization the session is scoped to, as recorded at sign-in. */
function homeUrl(): string {
  const org = localStorage.getItem('org_handle');
  return org && org !== 'default' ? orgHomeUrl(org) : '/';
}

// Neutrals ride on the theme's paper and text colours, accents on `currentColor`
// (the primary colour), so the art follows light and dark mode.
const PAPER = 'var(--oxygen-palette-background-paper, #fff)';
const INK = 'var(--oxygen-palette-text-primary, #3a3a40)';

/**
 * "Page not found" fallback. Usable anywhere a route or resource doesn't resolve, like
 * `ComingSoon`; pass `fullScreen` when it renders outside the app shell.
 */
export default function PageNotFound({ title = 'Page not found', description = 'The URL you’re trying to reach doesn’t exist or may have moved.', actionTo, actionLabel = 'Go to Home', fullScreen = false }: PageNotFoundProps): JSX.Element {
  return (
    <Box component="main" sx={{ ...pageSx, ...(fullScreen && fullScreenSx) }}>
      <Stack alignItems="center" gap={1} sx={textStackSx}>
        {/* Illustration: a magnifier sweeping a blank browser page whose address never resolves. */}
        <Box sx={artSx}>
          <svg viewBox="0 0 300 240" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A magnifier searching an empty page">
            <circle className="nf-halo" cx="150" cy="120" r="104" fill="currentColor" fillOpacity="0.06" />

            {/* The empty browser page */}
            <g className="nf-page">
              <rect x="52" y="52" width="196" height="138" rx="14" fill={PAPER} stroke={INK} strokeOpacity="0.12" strokeWidth="2" />
              <path d="M52 80 H248" stroke={INK} strokeOpacity="0.08" strokeWidth="1.5" />
              <circle cx="68" cy="66" r="3.5" fill="currentColor" fillOpacity="0.55" />
              <circle cx="80" cy="66" r="3.5" fill={INK} fillOpacity="0.12" />
              <circle cx="92" cy="66" r="3.5" fill={INK} fillOpacity="0.12" />
              {/* Address bar: a dashed, unresolved URL and a blinking caret */}
              <rect x="106" y="59" width="128" height="14" rx="7" fill={INK} fillOpacity="0.03" stroke={INK} strokeOpacity="0.08" strokeWidth="1.5" />
              <rect x="114" y="64" width="40" height="4" rx="2" fill={INK} fillOpacity="0.15" />
              <path d="M160 66 h32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 4" />
              <rect className="nf-caret" x="196" y="61" width="2" height="10" rx="1" fill="currentColor" />
              {/* Placeholder content */}
              <rect x="72" y="98" width="70" height="8" rx="4" fill={INK} fillOpacity="0.07" />
              <rect x="72" y="114" width="110" height="6" rx="3" fill={INK} fillOpacity="0.05" />
              <rect x="72" y="126" width="92" height="6" rx="3" fill={INK} fillOpacity="0.05" />
              <rect x="72" y="150" width="156" height="24" rx="8" fill={INK} fillOpacity="0.02" stroke={INK} strokeOpacity="0.1" strokeWidth="1.5" strokeDasharray="5 5" />
            </g>

            {/* Magnifier */}
            <g className="nf-lens">
              <circle cx="170" cy="132" r="30" fill="currentColor" fillOpacity="0.08" />
              <circle cx="170" cy="132" r="25" fill={PAPER} stroke="currentColor" strokeWidth="6" />
              <path d="M188 150 L210 172" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
              <text x="170" y="142" textAnchor="middle" fontSize="28" fontWeight="700" fill="currentColor" fontFamily="inherit">
                ?
              </text>
            </g>

            {/* Sparkles and ground shadow */}
            <path className="nf-spark" d="M258 40 l0 14 M251 47 l14 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path className="nf-spark-alt" d="M40 92 l0 10 M35 97 l10 0" stroke="currentColor" strokeOpacity="0.6" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="112" y="212" width="76" height="9" rx="4.5" fill={INK} fillOpacity="0.08" />
          </svg>
        </Box>
        <Typography variant="h4" component="h1" fontWeight={700} sx={{ mt: 1.5 }}>
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {description}
        </Typography>
        <Button variant="contained" component={Link} to={actionTo ?? homeUrl()} sx={actionSx}>
          {actionLabel}
        </Button>
      </Stack>
    </Box>
  );
}
