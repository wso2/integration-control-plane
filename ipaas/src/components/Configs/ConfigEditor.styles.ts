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

const MONO = 'monospace';

// One template shared by the header, every row and the add row so the columns line up.
const envGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 1.4fr) 72px', sm: 'minmax(0, 1fr) minmax(0, 1.6fr) 72px' },
  columnGap: 1.5,
  alignItems: 'center',
} as const;

export const section = { p: { xs: 2, sm: 2.5 }, borderRadius: 2 } as const;

export const sectionTitle = { fontWeight: 600, mb: 0.25 } as const;

export const typeCard = (selected: boolean, disabled: boolean) =>
  ({
    flex: 1,
    p: 2,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 1.5,
    textAlign: 'left',
    borderRadius: 2,
    cursor: disabled ? 'default' : 'pointer',
    borderColor: selected ? 'primary.main' : 'divider',
    bgcolor: 'background.paper',
    backgroundImage: (theme: Theme) => (selected ? `linear-gradient(${alpha(theme.palette.primary.main, 0.06)}, ${alpha(theme.palette.primary.main, 0.06)})` : 'none'),
    boxShadow: (theme: Theme) => (selected ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}` : 'none'),
    transition: 'border-color 120ms ease, background-color 120ms ease',
    '&:hover': disabled ? undefined : { borderColor: 'primary.main' },
    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
  }) as const;

export const typeIcon = (active: boolean) =>
  ({
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: 1.5,
    display: 'grid',
    placeItems: 'center',
    bgcolor: active ? 'primary.main' : 'action.hover',
    color: active ? 'primary.contrastText' : 'text.secondary',
  }) as const;

export const secretRow = { p: 2, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 2 } as const;

export const monoInput = { '& input': { fontFamily: MONO, fontSize: '0.875rem' } } as const;

export const pathPreview = {
  mt: 2,
  px: 1.5,
  py: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  borderRadius: 1.5,
  bgcolor: 'action.hover',
  color: 'text.secondary',
  minWidth: 0,
} as const;

export const pathPreviewValue = { fontFamily: MONO, fontSize: '0.8125rem', color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

export const contentInput = { '& textarea': { fontFamily: MONO, fontSize: '0.8125rem', lineHeight: 1.6 } } as const;

export const envEmpty = { py: 2, textAlign: 'center', borderBottom: 1, borderColor: 'divider' } as const;

export const envCountChip = { height: 20, fontSize: '0.75rem', fontWeight: 600 } as const;

export const envTable = { border: 1, borderColor: 'divider', borderRadius: 1.5, px: 1.5, pb: 1.5 } as const;

export const envHeadRow = { ...envGrid, py: 1, borderBottom: 1, borderColor: 'divider' } as const;

export const envHeadCell = { fontSize: '0.6875rem', fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' } as const;

export const envRow = { ...envGrid, py: 1, alignItems: 'start', borderBottom: 1, borderColor: 'divider', '& > p': { pt: 1 } } as const;

export const envKeyText = { fontFamily: MONO, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

export const envValueInput = { '& input': { fontFamily: MONO, fontSize: '0.8125rem' } } as const;

export const envActions = { display: 'flex', justifyContent: 'flex-end', gap: 0.5 } as const;

export const envAddRow = { ...envGrid, pt: 1.5, alignItems: 'start' } as const;

export const envDraftInput = {
  '& input': { fontFamily: MONO, fontSize: '0.8125rem' },
  '& .MuiOutlinedInput-notchedOutline': { borderStyle: 'dashed' },
} as const;

export const envAddButton = { justifySelf: 'end', minWidth: 0, height: 40 } as const;

export const envHelper = { mt: 1 } as const;
