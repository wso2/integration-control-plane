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

/** Card-grid layout and card styles shared by the User Portal page, its cards and its skeleton. */

export const cardGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
  gap: 3,
} as const;

export const cardSx = { display: 'flex', minWidth: 0 } as const;

export const cardContentSx = { p: 2.5, '&:last-child': { pb: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 } as const;

export const cardHeadSx = { display: 'flex', alignItems: 'flex-start', gap: 2, flex: 1 } as const;

export const logoBoxSx = {
  width: 64,
  height: 64,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'action.hover',
  color: 'text.secondary',
} as const;

export const detailsSx = { borderTop: 1, borderColor: 'divider', pt: 2 } as const;

export const detailRowSx = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 } as const;

export const actionButtonSx = { height: 36, minHeight: 36, py: 0.5 } as const;

export const emptySx = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', px: 3, py: 6 } as const;

export const emptyStackSx = { maxWidth: 440, textAlign: 'center' } as const;

export const emptyIconSx = { color: 'text.secondary', opacity: 0.5 } as const;
