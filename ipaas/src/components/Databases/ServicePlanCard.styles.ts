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

import { alpha, type Theme } from '@wso2/oxygen-ui';

export const cardSx = (selected: boolean, disabled: boolean) =>
  ({
    height: '100%',
    borderRadius: '8px',
    borderColor: selected ? 'primary.main' : 'divider',
    // A tint over Oxygen's own card surface, so both themes keep their card colour.
    backgroundImage: (theme: Theme) => (selected ? `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.12)}, ${alpha(theme.palette.primary.main, 0.03)})` : 'none'),
    boxShadow: (theme: Theme) => (selected ? `0 0 0 4px ${alpha(theme.palette.primary.main, 0.12)}` : 'none'),
    // Only the hover lift animates; selection repaints at once so a click feels instant.
    transition: 'transform 0.15s',
    '&:hover': disabled ? undefined : { transform: 'translateY(-2px)' },
  }) as const;

export const actionAreaSx = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'flex-start',
  gap: 2.25,
  p: 2.75,
  // The card keeps its own background on hover; the lift is the hover cue.
  '& .MuiCardActionArea-focusHighlight': { display: 'none' },
  '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main', outlineOffset: -2 },
} as const;

export const headerSx = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 } as const;

export const radioDotSx = (selected: boolean) =>
  ({
    width: 24,
    height: 24,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: 1.5,
    borderColor: selected ? 'primary.main' : 'text.disabled',
    bgcolor: selected ? 'primary.main' : 'transparent',
    color: 'primary.contrastText',
  }) as const;

export const priceSx = (selected: boolean) => ({ fontWeight: 700, letterSpacing: '-0.02em', color: selected ? 'primary.main' : 'text.primary' }) as const;

export const hourlySx = { fontFamily: 'monospace' } as const;

// Cells draw the inner lines themselves, so the grid has no fill of its own to clash with the card.
export const specGridSx = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  borderRadius: '6px',
  border: 1,
  borderColor: 'divider',
  overflow: 'hidden',
} as const;

export const specCellSx = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0.25,
  px: 1.5,
  py: 1.25,
  '&:nth-of-type(odd)': { borderRight: 1, borderColor: 'divider' },
  '&:nth-of-type(-n+2)': { borderBottom: 1, borderColor: 'divider' },
} as const;

// Pinned to the bottom, so the notes line up across cards of one row.
export const noteSx = { display: 'flex', alignItems: 'flex-start', gap: 1, mt: 'auto' } as const;

export const noteIconSx = { flexShrink: 0, mt: 0.25, display: 'flex' } as const;
