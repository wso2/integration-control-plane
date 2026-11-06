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

/** The third card beside the flow and the timeline, at their height; they give way to it. */
export const card = {
  width: 'min(420px, 34%)',
  flexShrink: 0,
  height: '100%',
  overflow: 'auto',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'background.paper',
} as const;

export const header = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, p: 2, borderBottom: '1px solid', borderColor: 'divider' } as const;

export const headerText = { minWidth: 0 } as const;

export const headerTitle = { fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

export const headerSubline = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 0.5, color: 'text.secondary' } as const;

export const body = { display: 'flex', flexDirection: 'column', gap: 2, p: 2 } as const;

export const configChipsRow = { display: 'flex', flexWrap: 'wrap', gap: 1 } as const;

export const configChip = { border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: 0.25, fontSize: 11, color: 'text.secondary' } as const;

export const mono = { fontFamily: 'monospace', fontSize: 12 } as const;

export const instanceRow = { display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, wordBreak: 'break-all' } as const;
