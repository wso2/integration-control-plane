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

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// The two streams keep one hue each in both themes; the lighter shade is for dark backgrounds.
const SOURCE_HUES = {
  gateway: { light: '#5b47d1', dark: '#a597ff' },
  component: { light: '#1f8a5e', dark: '#5cc690' },
} as const;

type LogSourceKind = keyof typeof SOURCE_HUES;

const hue = (theme: Theme, kind: LogSourceKind): string => SOURCE_HUES[kind][theme.palette.mode === 'dark' ? 'dark' : 'light'];

const LEVEL_COLOR: Record<string, string> = {
  ERROR: 'error.main',
  WARN: 'warning.main',
  INFO: 'info.main',
  DEBUG: 'text.secondary',
};

// 0 means no upstream response, which the row already marks as an error.
const statusColor = (status: number): string => (status === 0 || status >= 500 ? 'error.main' : status >= 400 ? 'warning.main' : 'success.main');

export const rowSx = (isError: boolean, expanded: boolean) =>
  ({
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '3px solid',
    borderLeftColor: isError ? 'error.main' : expanded ? 'divider' : 'transparent',
    bgcolor: expanded ? 'action.hover' : isError ? 'rgba(212, 85, 63, 0.07)' : 'transparent',
    '&:hover .log-copy': { visibility: 'visible' },
  }) as const;

export const lineSx = {
  display: 'flex',
  alignItems: 'center',
} as const;

export const toggleSx = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 1.25,
  minHeight: 34,
  pl: 1.5,
  pr: 1,
  fontFamily: MONO,
  fontSize: 12.5,
  textAlign: 'left',
  color: 'text.primary',
  '&:hover': { bgcolor: 'action.hover' },
} as const;

export const chevronSx = (expanded: boolean) =>
  ({
    display: 'flex',
    flexShrink: 0,
    color: 'text.secondary',
    transform: expanded ? 'rotate(90deg)' : 'none',
    transition: 'transform 120ms ease',
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  }) as const;

export const timeSx = {
  flexShrink: 0,
  minWidth: 92,
  color: 'text.secondary',
  whiteSpace: 'nowrap',
} as const;

export const levelSx = (level: string) =>
  ({
    flexShrink: 0,
    width: 44,
    fontWeight: 600,
    color: LEVEL_COLOR[level] ?? 'text.secondary',
  }) as const;

export const sourceBadgeSx = (kind: LogSourceKind) =>
  ({
    flexShrink: 0,
    height: 20,
    display: 'inline-flex',
    alignItems: 'center',
    px: 0.875,
    borderRadius: '5px',
    fontSize: 11,
    fontWeight: 600,
    color: (theme: Theme) => hue(theme, kind),
    bgcolor: (theme: Theme) => `${hue(theme, kind)}1f`,
  }) as const;

export const metaSx = {
  flexShrink: 0,
  fontSize: 11.5,
  color: 'text.secondary',
  whiteSpace: 'nowrap',
} as const;

export const tagSx = {
  flexShrink: 0,
  height: 20,
  display: 'inline-flex',
  alignItems: 'center',
  px: 0.875,
  borderRadius: '5px',
  fontSize: 11,
  color: 'text.secondary',
  bgcolor: 'action.selected',
} as const;

export const statusSx = (status: number) =>
  ({
    flexShrink: 0,
    fontWeight: 600,
    color: statusColor(status),
  }) as const;

export const messageSx = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export const durationSx = {
  flexShrink: 0,
  color: 'text.secondary',
  whiteSpace: 'nowrap',
} as const;

export const copyButtonSx = {
  visibility: 'hidden',
  mr: 1,
} as const;

// One field per row: a fixed label column keeps every value starting at the same edge.
export const detailsSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '110px minmax(0, 1fr)', md: '140px minmax(0, 1fr)' },
  columnGap: 2,
  rowGap: 0.75,
  alignItems: 'baseline',
  m: 0,
  pt: 0.5,
  pb: 2,
  pl: 6.25,
  pr: 2,
} as const;

export const detailLabelSx = {
  fontSize: 11,
  fontWeight: 600,
  color: 'text.secondary',
} as const;

export const detailValueSx = {
  m: 0,
  fontFamily: MONO,
  fontSize: 12.5,
  wordBreak: 'break-all',
} as const;

export const rawLineSx = {
  m: 0,
  mt: 0.5,
  px: 1.5,
  py: 1.25,
  borderRadius: 1,
  bgcolor: 'background.default',
  fontFamily: MONO,
  fontSize: 12,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
} as const;
