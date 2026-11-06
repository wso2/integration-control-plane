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

export const toolbarSx = {
  mb: 2,
} as const;

export const toolbarRowSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 1.25,
} as const;

export const toolbarActionsSx = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 1.25,
} as const;

export const searchFieldSx = {
  minWidth: 240,
} as const;

export const toolButtonSx = {
  height: 40,
  minWidth: 40,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
} as const;

export const timeSelectSx = {
  minWidth: 180,
  height: 40,
  '& .MuiSelect-select': { pl: 1 },
  '& svg.lucide': { ml: 1, color: 'text.secondary', flexShrink: 0 },
} as const;

export const sourceSelectSx = {
  minWidth: 170,
  height: 40,
} as const;

export const refreshIconSx = (spinning: boolean) =>
  ({
    display: 'flex',
    animation: spinning ? 'logs-refresh-spin 0.8s linear infinite' : 'none',
    '@keyframes logs-refresh-spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  }) as const;

export const customRangeSx = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 1.25,
  mt: 1.5,
} as const;

export const appliedRowSx = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 0.75,
  mt: 1.25,
} as const;

export const menuSx = {
  width: 340,
  maxWidth: 'calc(100vw - 32px)',
  p: 3,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
} as const;

export const menuSectionTitleSx = {
  fontSize: 11.5,
  fontWeight: 600,
  color: 'text.secondary',
} as const;

export const optionGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
} as const;

export const menuFooterSx = {
  display: 'flex',
  justifyContent: 'space-between',
  pt: 1,
  borderTop: '1px solid',
  borderColor: 'divider',
} as const;
