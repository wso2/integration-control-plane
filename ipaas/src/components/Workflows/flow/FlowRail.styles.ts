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
import { softPrimary } from './graphVisuals';

/**
 * The rail's styling. Only the genuinely dynamic
 * values (a row's status colour, its indent) stay inline at the call site.
 *
 * Indentation is a CSS custom property rather than a style per depth, because nesting depth is
 * unbounded: a row sets `--wf-indent` and these rules read it.
 */

const INDENT = 'var(--wf-indent, 0px)';

const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

export const root = { overflow: 'auto', height: '100%', px: 0.5, py: 1 } as const;

export const umlScroll = { overflow: 'auto', height: '100%', px: 0.5, py: 1 } as const;

export const terminusRow = { display: 'flex', alignItems: 'center', gap: 0.75, py: 0.5, pl: 1, color: 'text.secondary', minWidth: 0 } as const;

export const terminusDot = (filled: boolean) =>
  ({
    width: 11,
    height: 11,
    borderRadius: '50%',
    flexShrink: 0,
    ...(filled ? { bgcolor: 'text.primary' } : { border: '2px solid', borderColor: 'text.primary' }),
  }) as const;

export const terminusLabel = { fontWeight: 700, fontSize: 11, fontFamily: 'monospace', ...ellipsis } as const;

export const keywordRow = (toggleable: boolean) => (theme: Theme) =>
  ({
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    py: 0.4,
    pr: 1,
    pl: 0.75,
    my: 0.25,
    ml: INDENT,
    color: 'text.secondary',
    minWidth: 0,
    borderRadius: 1,
    border: '1px dashed',
    borderColor: 'divider',
    width: 'fit-content',
    maxWidth: '100%',
    ...(toggleable ? { cursor: 'pointer', '&:hover': { bgcolor: softPrimary(theme, 0.05) } } : {}),
  }) as const;

export const keywordText = (muted: boolean) => ({ fontWeight: muted ? 400 : 700, fontSize: 11.5, fontFamily: 'monospace', color: muted ? 'text.disabled' : undefined, ...ellipsis }) as const;

export const glyph = { display: 'flex', flexShrink: 0 } as const;

export const aggregateDot = { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 } as const;

export const stepRow = (selected: boolean) => (theme: Theme) =>
  ({
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
    py: 0.5,
    pr: 1,
    pl: 0.75,
    my: 0.25,
    ml: INDENT,
    cursor: 'pointer',
    borderRadius: 1,
    border: '1px solid',
    // The execution path as a line down the rail: an executed row carries its status colour.
    borderLeftWidth: 3,
    bgcolor: selected ? softPrimary(theme, 0.12) : 'background.paper',
    outline: selected ? '1px solid' : 'none',
    outlineColor: 'primary.main',
    width: 'fit-content',
    maxWidth: '100%',
    minWidth: 140,
    '&:hover': { bgcolor: softPrimary(theme, selected ? 0.12 : 0.06) },
    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
  }) as const;

export const stepLabel = (ran: boolean) => ({ fontSize: 12.5, minWidth: 0, flex: 1, fontWeight: ran ? 600 : 400, color: ran ? 'text.primary' : 'text.disabled', ...ellipsis }) as const;

export const recoveredIcon = { color: 'warning.main', display: 'flex', flexShrink: 0 } as const;

export const countBadge = { fontWeight: 700, fontSize: 10.5, flexShrink: 0 } as const;

export const markRow = { display: 'block', py: 0.25, pl: INDENT, ml: 2.5, color: 'text.disabled', fontStyle: 'italic', fontSize: 11, ...ellipsis } as const;
