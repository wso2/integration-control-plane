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
    mb: hasSubtitle ? 1 : 0,
  }) as const;

// Pushed to the header's right edge.
export const logsButtonSx = {
  textTransform: 'none',
  fontSize: '0.75rem',
  flexShrink: 0,
  ml: 'auto',
} as const;

// The gap above the divider lives inside the log panel's Collapse, so it closes with the panel
// instead of snapping shut the moment the logs are hidden.
export const dividerSx = { mt: 1.5, mb: 2 } as const;
