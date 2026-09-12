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

export const sectionSx = {
  mt: 8,
} as const;

export const headingSx = {
  fontWeight: 600,
  mb: 1.5,
} as const;

export const cardSx = {
  boxShadow: 'none',
} as const;

export const cardContentSx = {
  p: 3,
  '&:last-child': { pb: 3 },
} as const;

export const gridSx = {
  display: 'grid',
  gap: 4,
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
} as const;

export const groupSx = {
  minWidth: 0,
} as const;

export const groupIconSx = {
  color: 'primary.main',
  flexShrink: 0,
  mt: 0.25,
} as const;

export const groupTitleSx = {
  fontWeight: 600,
  mb: 1,
} as const;

/** Body-coloured until hover, so only the arrow carries the accent at rest. */
export const linkSx = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 0.5,
  color: 'text.primary',
  '&:hover': { color: 'primary.main' },
} as const;

export const linkArrowSx = {
  flexShrink: 0,
  display: 'flex',
  mt: '2px',
  color: 'primary.main',
} as const;
