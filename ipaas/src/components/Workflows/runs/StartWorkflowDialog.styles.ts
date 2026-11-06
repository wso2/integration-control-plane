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

// The started state is a confirmation, laid out on one centre line: what happened, the id it
// happened under, and what to do next.

export const startedTitle = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 } as const;

export const startedIcon = { display: 'flex', color: 'success.main' } as const;

export const started = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center' } as const;

export const idBox = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  width: '100%',
  px: 2,
  py: 1.5,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'action.hover',
  textAlign: 'left',
} as const;

export const idText = { flex: 1, minWidth: 0 } as const;

export const idLabel = { display: 'block', fontWeight: 600, color: 'text.secondary' } as const;

export const idValue = { fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' } as const;

export const centredActions = { justifyContent: 'center' } as const;

export const form = { pt: 1 } as const;

export const advancedToggle = { alignSelf: 'flex-start' } as const;
