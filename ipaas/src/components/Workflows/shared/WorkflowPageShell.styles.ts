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

/** The page fills the content area, as the other integration pages with a track bar do. */
export const page = { display: 'flex', flexDirection: 'column', minHeight: 0 } as const;

export const titleRow = { mb: 3 } as const;

export const connecting = { display: 'block', mb: 1.5 } as const;

export const toolbar = { display: 'flex', alignItems: 'center', gap: 2, mb: 2 } as const;

export const table = { border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' } as const;

export const tableRow = { display: 'flex', alignItems: 'center', gap: 3, px: 2, py: 1.5, '& + &': { borderTop: '1px solid', borderColor: 'divider' } } as const;

export const bandSkeleton = { borderBottom: '1px solid', borderColor: 'divider', minHeight: 48 } as const;
