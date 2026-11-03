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

export const cardSx = {
  mt: 2,
  mb: 3,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  p: 2,
} as const;

/** Title in the placeholder card, where the spacing depends on whether a line follows. */
export const placeholderTitleSx = (hasSubtitle: boolean) =>
  ({
    fontWeight: 600,
    textTransform: 'capitalize',
    mb: hasSubtitle ? 1 : 0,
  }) as const;

export const headerRowSx = (expanded: boolean) =>
  ({
    mb: expanded ? 1.5 : 0,
  }) as const;

export const minWidthZeroSx = { minWidth: 0 } as const;

export const noShrinkSx = { flexShrink: 0 } as const;

export const statusDotSx = (color: string) =>
  ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    bgcolor: color,
    flexShrink: 0,
  }) as const;

export const logsButtonSx = {
  textTransform: 'none',
  fontSize: '0.75rem',
  ml: 1,
} as const;

export const centeredRowSx = {
  display: 'flex',
  justifyContent: 'center',
  py: 2,
} as const;

export const stepperWrapSx = (hasLogsBelow: boolean) =>
  ({
    mb: hasLogsBelow ? 2 : 0,
  }) as const;

export const alertSx = { my: 1 } as const;
