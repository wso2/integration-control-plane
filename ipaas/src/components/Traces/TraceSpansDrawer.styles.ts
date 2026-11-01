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

export const drawer = {
  '& .MuiDrawer-paper': { width: { xs: '100%', md: '80%' }, maxWidth: 1100, display: 'flex', flexDirection: 'column' },
} as const;

export const header = { px: 3, py: 2, borderBottom: 1, borderColor: 'divider' } as const;

export const traceId = { fontFamily: 'monospace', color: 'text.secondary' } as const;

export const body = { display: 'flex', flex: 1, minHeight: 0 } as const;

export const treePane = { width: '55%', overflow: 'auto', borderRight: 1, borderColor: 'divider', p: 1 } as const;

export const detailPane = { flex: 1, overflow: 'auto', p: 2 } as const;

export const centered = { display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, py: 6 } as const;

export const spanRow = (selected: boolean) =>
  ({
    width: '100%',
    textAlign: 'left',
    px: 1,
    py: 0.75,
    borderRadius: 1,
    cursor: 'pointer',
    border: 'none',
    bgcolor: selected ? 'action.selected' : 'transparent',
    '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
  }) as const;

export const spanIndent = (depth: number) => ({ pl: depth * 1.5 }) as const;

export const waterfallTrack = { position: 'relative', height: 4, bgcolor: 'action.hover', borderRadius: 2, mt: 0.5 } as const;

export const waterfallBar = (offset: number, width: number, error: boolean) =>
  ({
    position: 'absolute',
    left: `${offset * 100}%`,
    // A span shorter than a pixel still has to be visible as a mark.
    width: `max(${width * 100}%, 2px)`,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    bgcolor: error ? 'error.main' : 'primary.main',
  }) as const;

export const attributeKey = { fontFamily: 'monospace', color: 'text.secondary', wordBreak: 'break-all' } as const;

export const attributeValue = { fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', m: 0 } as const;

export const attributeBlock = { mb: 2 } as const;
