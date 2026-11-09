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

import type { Theme } from '@wso2/oxygen-ui';

/** Six figures in one row on a wide card, two rows of three, or three rows of two on a narrow one. */
export const strip = {
  display: 'grid',
  gap: 1.5,
  gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' },
} as const;

/** One figure: a link to the list behind it, framed like the card's other metric tiles. */
export const tile = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 1.5,
  minWidth: 0,
  px: 1.5,
  py: 1.25,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  color: 'text.primary',
  textAlign: 'left',
  textDecoration: 'none',
  transition: 'background-color 120ms ease, border-color 120ms ease',
  '&:hover': { bgcolor: 'action.hover' },
  '&.Mui-focusVisible': { borderColor: 'primary.main', bgcolor: 'action.focus' },
} as const;

/** A figure with no list to open: framed as the others, without a link's hover. */
export const staticTile = { ...tile, '&:hover': {}, '&:focus-visible': { outline: 'none', borderColor: 'primary.main' } } as const;

/** A palette colour as CSS: the theme's variable when it has one, so it follows the colour scheme. */
const errorColor = (theme: Theme) => (theme.vars ?? theme).palette.error.main;

/** A figure that counts failures, while there are any: an error-toned frame. */
export const alarmTile = (theme: Theme) => ({
  borderColor: `color-mix(in srgb, ${errorColor(theme)} 45%, transparent)`,
  bgcolor: `color-mix(in srgb, ${errorColor(theme)} 6%, transparent)`,
});

/** The figure's icon, in the tone of the status it counts, as the Workflows list's chips draw it. */
export const icon = (tone: string) => ({ width: 32, height: 32, flexShrink: 0, bgcolor: 'action.selected', color: tone }) as const;

export const text = { minWidth: 0 } as const;

export const label = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

export const value = { fontWeight: 600, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' } as const;

export const valueSkeleton = { width: 28, height: 28 } as const;

/** Work waiting on a person, drawn as a notification count in the theme's attention colour. */
export const badge = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 24,
  height: 24,
  px: 0.75,
  borderRadius: 12,
  bgcolor: 'warning.main',
  color: 'warning.contrastText',
  fontSize: '0.8125rem',
  fontWeight: 700,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
} as const;
