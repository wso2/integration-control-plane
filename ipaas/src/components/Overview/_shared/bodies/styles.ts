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
import type { OperationTileColors } from './OperationTile';

// ── Operation tile / header (shared by OperationTile + OperationHeader) ──────

/** A palette token such as `primary.main` as a CSS colour; a raw colour passes through. */
const cssColor = (theme: Theme, value: string): string => {
  const [group, shade] = value.split('.');
  const palette = (theme.vars ?? theme).palette as unknown as Record<string, Record<string, string> | undefined>;
  return (shade && palette[group]?.[shade]) || value;
};

/** Dark mode swaps `cardBg` (Devant's light method colours) for a deeper wash, since those glare there. */
const tileBackground = (colors: OperationTileColors) => (theme: Theme) => ({
  border: '1px solid',
  borderColor: `color-mix(in srgb, ${cssColor(theme, colors.badgeBg)} 30%, transparent)`,
  bgcolor: colors.cardBg ?? `color-mix(in srgb, ${cssColor(theme, colors.badgeBg)} 8%, transparent)`,
  ...theme.applyStyles('dark', { bgcolor: `color-mix(in srgb, ${cssColor(theme, colors.badgeBg)} 16%, transparent)` }),
});

/** Tile row container — colour-dependent, so built per consumer's `colors`. */
export const operationTileSx = (colors: OperationTileColors) => [
  {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    px: 1,
    py: 0.75,
    mb: 0.75,
    borderRadius: 0.5,
    '&:last-child': { mb: 0 },
  } as const,
  tileBackground(colors),
];

/** In-drawer header row that visually mirrors the tile. */
export const operationHeaderRowSx = (colors: OperationTileColors) => [{ borderRadius: 0.5, px: 1.5, py: 1 } as const, tileBackground(colors)];

/** The coloured type/verb badge. `minWidth` differs between tile (72) and header (64). */
export const operationBadgeSx = (colors: OperationTileColors, minWidth: number) =>
  ({
    bgcolor: colors.badgeBg,
    color: colors.badgeText ?? '#fff',
    fontWeight: 700,
    fontSize: '11px',
    minWidth,
    px: 1,
    py: 0.5,
    borderRadius: 0.5,
    textAlign: 'center',
    flexShrink: 0,
  }) as const;

export const OPERATION_TILE_LABEL_SX = { flex: 1, fontSize: '13px', fontWeight: 500, wordBreak: 'break-word', color: 'text.primary' } as const;
export const OPERATION_HEADER_LABEL_SX = { fontFamily: 'monospace', fontWeight: 500, wordBreak: 'break-word', color: 'text.primary' } as const;
export const OPERATION_DESCRIPTION_SX = { mt: 1, px: 0.5 } as const;
export const VIEW_DETAILS_BUTTON_SX = { fontSize: '12px', flexShrink: 0, textTransform: 'none' } as const;

// ── File / event runtime-log body ────────────────────────────────────────────

export const LOG_CONTAINER_SX = { display: 'flex', flexDirection: 'column', maxHeight: 300, overflow: 'auto', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 0.5 } as const;
export const LOG_ROW_SX = { px: 1.5, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: 'none' } } as const;
export const LOG_TIME_CAPTION_SX = { fontFamily: 'monospace', color: 'text.secondary', flexShrink: 0 } as const;
/** Level caption — the consumer spreads its level colour on top: `{ ...LOG_LEVEL_CAPTION_SX, color }`. */
export const LOG_LEVEL_CAPTION_SX = { fontFamily: 'monospace', fontWeight: 600, minWidth: 48, flexShrink: 0 } as const;
export const LOG_LINE_CAPTION_SX = { fontFamily: 'monospace', wordBreak: 'break-word', flex: 1 } as const;
