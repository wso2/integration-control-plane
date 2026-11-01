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

export const container = { mt: 2 } as const;

export const row = { cursor: 'pointer' } as const;

export const traceButton = {
  p: 0,
  minWidth: 0,
  textAlign: 'left',
  justifyContent: 'flex-start',
  fontWeight: 'inherit',
  typography: 'body2',
} as const;

export const traceId = { fontFamily: 'monospace', color: 'text.secondary' } as const;

export const preview = { color: 'text.secondary', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

export const numeric = { fontVariantNumeric: 'tabular-nums' } as const;

export const chips = { flexWrap: 'wrap', rowGap: 0.5 } as const;

export const footer = { mt: 2, justifyContent: 'space-between', alignItems: 'center' } as const;

export const centered = { display: 'flex', justifyContent: 'center', py: 6 } as const;
