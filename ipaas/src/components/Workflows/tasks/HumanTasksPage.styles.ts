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

// One filter dropdown's width; the search above the filters is measured in these.
const FILTER_WIDTH = 200;
const FILTER_GAP = 2;

export const searchRow = { mb: 2 } as const;

// Ends where the second filter (Status) ends, so the search and the filters it narrows read as one block.
export const searchField = (theme: Theme) => ({ width: `calc(${FILTER_WIDTH * 2}px + ${theme.spacing(FILTER_GAP)})`, maxWidth: '100%' }) as const;

export const toolbar = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: FILTER_GAP, mb: 2 } as const;

export const filterSelect = { width: FILTER_WIDTH } as const;

export const spacer = { flexGrow: 1 } as const;

/** The selection bar, shown while choosing reviews to decide together. */
export const bulkBar = (theme: Theme) =>
  ({
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 1.5,
    mb: 2,
    px: 1.5,
    py: 1,
    border: '1px solid',
    borderColor: 'primary.main',
    borderRadius: 1,
    bgcolor: alpha(theme.palette.primary.main, 0.06),
  }) as const;

export const bulkBarText = { flex: 1, minWidth: 240 } as const;

export const alert = { mb: 2 } as const;

export const loadMore = { display: 'flex', justifyContent: 'center', mt: 2 } as const;

export const placeholder = { color: 'text.secondary' } as const;
