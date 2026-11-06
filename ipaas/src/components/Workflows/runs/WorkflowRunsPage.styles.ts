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

// One filter dropdown's width; the search above the filters is measured in these.
const FILTER_WIDTH = 200;
const FILTER_GAP = 2;

/** The search with the page's own action at the far end of the same row. */
export const searchActionRow = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2 } as const;

/** Ends where the second filter ends, so the search and the filters it narrows read as one block. */
export const searchField = (theme: Theme) => ({ width: `calc(${FILTER_WIDTH * 2}px + ${theme.spacing(FILTER_GAP)})`, maxWidth: '100%' }) as const;

export const toolbar = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: FILTER_GAP, mb: 2 } as const;

export const toolbarSpacer = { flexGrow: 1 } as const;

export const filterSelect = { width: FILTER_WIDTH } as const;

export const notice = { mb: 2 } as const;

export const headerCell = { fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', whiteSpace: 'nowrap' } as const;

export const idCell = { fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' } as const;

/** A failed run's row carries a thin error rule on its leading edge; its chip already says why. */
export const runRow = (failed: boolean) => (theme: Theme) =>
  ({
    cursor: 'pointer',
    ...(failed ? { '& > td:first-of-type': { boxShadow: `inset 3px 0 0 ${(theme.vars ?? theme).palette.error.main}` } } : {}),
  }) as const;

export const emptyCell = { py: 4, textAlign: 'center', color: 'text.secondary' } as const;

export const footer = { display: 'flex', justifyContent: 'center', mt: 2 } as const;

export const listError = { mt: 2 } as const;
