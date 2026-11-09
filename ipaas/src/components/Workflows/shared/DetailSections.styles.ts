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

/** Values at 13px, their labels a step below at 12px, each section titled at 14px: these views are read closely. */

export const header = { display: 'flex', flexDirection: 'column', gap: 0.75, pb: 1 } as const;

export const headerTitleRow = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 } as const;

export const headerTitle = { fontSize: '1.3125rem', fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' } as const;

export const headerMeta = { fontSize: '0.8125rem', color: 'text.secondary' } as const;

export const section = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1.25,
  bgcolor: 'background.paper',
  overflow: 'hidden',
} as const;

export const sectionHeader = {
  display: 'flex',
  alignItems: 'center',
  bgcolor: 'action.hover',
  borderBottom: '1px solid',
  borderColor: 'divider',
} as const;

export const sectionTitleBlock = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  flex: 1,
  minWidth: 0,
  px: 2.5,
  py: 1.75,
  justifyContent: 'flex-start',
  textAlign: 'left',
} as const;

export const sectionTitle = { fontSize: '0.875rem', fontWeight: 600 } as const;

export const chevron = (open: boolean) => ({ display: 'flex', color: 'text.secondary', transition: 'transform 0.15s', transform: open ? 'none' : 'rotate(-90deg)' }) as const;

export const sectionActions = { display: 'flex', alignItems: 'center', gap: 0.5, pr: 2, flexShrink: 0 } as const;

export const sectionBody = { px: 3, py: 2.5 } as const;

export const detailList = { display: 'flex', flexDirection: 'column' } as const;

/** Label and value on one line, rows parted by a hairline rather than by blank space. Shared with `StructuredValue`'s rows. */
export const detailRow = {
  display: 'grid',
  gridTemplateColumns: '180px minmax(0, 1fr)',
  columnGap: 2,
  alignItems: 'center',
  py: 1.25,
  '& + &': { borderTop: '1px solid', borderColor: 'divider' },
  '&:first-of-type': { pt: 0 },
  '&:last-of-type': { pb: 0 },
} as const;

export const detailLabel = { fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary' } as const;

export const detailValue = { minWidth: 0, fontSize: '0.8125rem', wordBreak: 'break-word' } as const;

export const idText = { display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0 } as const;

export const idValue = { fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap' } as const;

export const notProvided = { fontSize: '0.8125rem', color: 'text.disabled', fontStyle: 'italic' } as const;

export const actionRow = { display: 'flex', flexWrap: 'wrap', gap: 2 } as const;

/** Cards share the row between them, wrapping only when the row is too narrow. */
export const actionCard = (selected: boolean, disabled: boolean) => (theme: Theme) =>
  ({
    flex: '1 1 260px',
    display: 'flex',
    border: '1px solid',
    borderColor: selected ? 'primary.main' : 'divider',
    borderRadius: 1.25,
    bgcolor: selected ? alpha(theme.palette.primary.main, 0.06) : 'background.paper',
    boxShadow: selected ? `0 0 0 1px ${theme.palette.primary.main}` : 'none',
    overflow: 'hidden',
    opacity: disabled ? 0.55 : 1,
    transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s',
    '&:hover': disabled ? {} : { borderColor: 'primary.main', boxShadow: theme.shadows[2] },
  }) as const;

export const actionCardButton = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, width: '100%', px: 2.5, py: 2, textAlign: 'left' } as const;

export const actionCardTitle = { fontSize: '0.875rem', fontWeight: 600 } as const;

export const actionCardSubtitle = { mt: 0.5, fontSize: '0.75rem', lineHeight: 1.5, color: 'text.secondary' } as const;

export const actionCardInfo = { display: 'inline-flex', color: 'text.secondary', mt: 0.25 } as const;

export const actionCardTooltipWrap = { display: 'flex', flex: '1 1 260px' } as const;
