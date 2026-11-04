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

const MONO = 'monospace';

// One template shared by the header, every row and the add row so the columns line up.
const envGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 1.4fr) 72px', sm: 'minmax(0, 1fr) minmax(0, 1.6fr) 72px' },
  columnGap: 1.5,
  alignItems: 'center',
} as const;

export const envHeader = { mt: 3, mb: 2 } as const;

export const envTitle = { fontWeight: 600 } as const;

export const envCountChip = { height: 20, fontSize: '0.75rem', fontWeight: 600 } as const;

export const envImportButton = { flexShrink: 0 } as const;

export const envTable = { borderTop: 1, borderColor: 'divider' } as const;

export const envHeadCell = { fontSize: '0.6875rem', fontWeight: 600, color: 'text.secondary' } as const;

export const envRow = { ...envGrid, py: 1, borderBottom: 1, borderColor: 'divider' } as const;

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
