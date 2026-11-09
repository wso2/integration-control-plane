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

export const container = { border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' } as const;

/** A failed item is tinted, as the Workflows list tints a failed run; the rest are marked by their chip. */
export const row = (failed: boolean) => (theme: Theme) =>
  ({
    cursor: 'pointer',
    ...(failed ? { bgcolor: alpha(theme.palette.error.main, 0.04) } : {}),
    '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
  }) as const;

export const titleCell = { display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 } as const;

export const kindIcon = { display: 'flex', color: 'text.secondary', flexShrink: 0 } as const;

export const titleText = { minWidth: 0 } as const;

export const caption = { display: 'block', color: 'text.secondary' } as const;

export const empty = { py: 6, color: 'text.secondary' } as const;

export const nowrap = { whiteSpace: 'nowrap' } as const;
