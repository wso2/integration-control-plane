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

// Static sx for AuditLogRow — hoisted so they aren't re-allocated on every row render.

const mono = {
  fontFamily: 'monospace',
  fontSize: 12,
} as const;

export const rowSx = {
  ...mono,
  px: 0.5,
  py: 0.25,
  cursor: 'pointer',
  borderRadius: 1,
  minHeight: 32,
  '&:hover': { bgcolor: 'action.hover' },
  '&:hover .audit-actions': { visibility: 'visible' },
} as const;

export const expandBtnSx = {
  p: 0,
  mr: 0.5,
} as const;

export const timestampSx = {
  ...mono,
  color: 'text.secondary',
  whiteSpace: 'nowrap',
  mr: 1,
} as const;

export const outcomeChipSx = {
  fontFamily: 'monospace',
  fontSize: 10,
  height: 18,
  mr: 1,
  textTransform: 'capitalize',
  fontWeight: 700,
} as const;

export const actorChipSx = {
  fontFamily: 'monospace',
  fontSize: 10,
  height: 18,
  mr: 1,
  bgcolor: 'action.selected',
  color: 'text.secondary',
  fontWeight: 600,
} as const;

export const summarySx = {
  ...mono,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
} as const;

export const actionsSx = {
  visibility: 'hidden',
  ml: 1,
  flexShrink: 0,
} as const;

export const detailBlockSx = {
  ...mono,
  pl: 5,
  pb: 1,
  bgcolor: 'background.default',
  borderRadius: 1,
  mx: 0.5,
  mb: 0.5,
} as const;

export const detailRowSx = {
  borderBottom: '1px solid',
  borderColor: 'divider',
  py: 0.5,
  gap: 2,
} as const;

export const detailKeySx = {
  ...mono,
  fontWeight: 600,
  minWidth: 160,
  flexShrink: 0,
} as const;

export const detailValueSx = {
  ...mono,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
} as const;
