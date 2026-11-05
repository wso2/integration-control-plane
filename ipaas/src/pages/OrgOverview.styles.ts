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

import { LIT_ICON_SX } from '../constants/styles';

export const greeting = {
  mb: 1,
  fontWeight: 700,
} as const;

export const summaryGrid = {
  display: 'grid',
  gap: 3,
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
  mb: 3,
} as const;

// Plain (elevation) cards, as API Manager uses: in dark mode they pick up the theme's lighter overlay.
export const summaryCard = {
  display: 'flex',
  flexDirection: 'column',
} as const;

export const summaryBody = {
  display: 'flex',
  gap: 2,
  p: 2.5,
  flex: 1,
} as const;

export const iconTile = {
  ...LIT_ICON_SX,
  width: 48,
  height: 48,
} as const;

// Matches the action button's size, so the card title and its link read as one scale.
export const summaryTitle = {
  fontSize: (theme: { typography: { button: { fontSize?: string | number } } }) => theme.typography.button.fontSize,
} as const;

export const countDivider = {
  borderLeft: 1,
  borderColor: 'divider',
  pl: 1.5,
  ml: 1.5,
} as const;

export const summaryAction = {
  justifyContent: 'space-between',
  px: 2.5,
  py: 1.5,
  borderRadius: 0,
  fontWeight: 600,
} as const;

// Matches Explore More's top margin, so the intro and the sections below it share one gap.
export const intro = {
  mb: 5,
} as const;

export const sectionHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  px: 2.5,
  py: 2,
  minHeight: 72,
} as const;

export const listRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  px: 2.5,
  py: 1,
  width: '100%',
  borderRadius: 0,
  textAlign: 'left',
  '&:hover': { bgcolor: 'action.hover' },
} as const;

export const projectAvatar = {
  width: 40,
  height: 40,
  flexShrink: 0,
} as const;

// Fixed widths, so each column starts at the same x on every row whatever its text.
export const integrationsColumn = {
  width: 112,
} as const;

export const updatedColumn = {
  width: 116,
} as const;

export const rowMeta = {
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  flexShrink: 0,
  color: 'text.secondary',
} as const;

// Same inset as the section header, so the link lines up with Create Project above it.
export const allProjectsRow = {
  display: 'flex',
  justifyContent: 'flex-end',
  px: 2.5,
  py: 1.5,
} as const;

export const allProjectsLink = {
  fontWeight: 600,
} as const;
