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

export const root = { mt: 6 } as const;

export const header = { mb: 1.5 } as const;

export const healthIcon = (allHealthy: boolean) => ({ display: 'flex', color: allHealthy ? 'success.main' : 'warning.main' }) as const;

export const loading = { display: 'flex', justifyContent: 'center', py: 6 } as const;

export const container = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  overflowX: 'auto',
} as const;

export const emptyRow = { py: 5, color: 'text.secondary' } as const;

export const podCell = { maxWidth: 220 } as const;

export const podName = {
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/** Icon and label share the status colour; the chip's own palette only tints the border. */
export const statusChip = (text: string) =>
  ({
    whiteSpace: 'nowrap',
    '& .MuiChip-label': { color: text, fontSize: '0.875rem' },
    '& .MuiChip-icon': { ml: 1, color: text },
  }) as const;
