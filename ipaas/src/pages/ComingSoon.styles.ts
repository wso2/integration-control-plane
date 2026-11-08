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

export const pageSx = {
  display: 'flex',
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

/**
 * The illustration's motion. Both rotating parts need `transformBox: view-box` so
 * `transformOrigin` resolves against the SVG's viewBox — without it the second hand
 * would pivot around its own midpoint instead of the clock's centre.
 */
export const artSx = {
  color: 'primary.main',
  width: 180,
  maxWidth: '100%',
  '& .cs-ring, & .cs-second': {
    transformBox: 'view-box',
    transformOrigin: '100px 100px',
  },
  '& .cs-ring': {
    animation: 'csRingSpin 40s linear infinite',
  },
  '& .cs-second': {
    animation: 'csSecondSweep 8s linear infinite',
  },
  '@keyframes csRingSpin': {
    to: { transform: 'rotate(360deg)' },
  },
  '@keyframes csSecondSweep': {
    to: { transform: 'rotate(360deg)' },
  },
  '@media (prefers-reduced-motion: reduce)': {
    '& .cs-ring, & .cs-second': { animation: 'none' },
  },
} as const;

export const textStackSx = {
  maxWidth: 480,
  textAlign: 'center',
} as const;

export const descriptionSx = {
  maxWidth: 380,
} as const;

/** The inline variant: the same art, smaller, in a panel's flow. */
export const inlineArtSx = { ...artSx, width: 110 } as const;

export const inlineSx = {
  py: 4,
  textAlign: 'center',
} as const;
