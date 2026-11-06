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

import { detailRow } from './DetailSections.styles';

export const bare = { fontFamily: 'monospace', fontSize: '0.8125rem', wordBreak: 'break-word' } as const;

export const rows = { display: 'flex', flexDirection: 'column', minWidth: 0 } as const;

export const nested = { ...rows, mt: 1, pl: 2, borderLeft: '2px solid', borderColor: 'divider' } as const;

/** The same grid and hairlines as a section's detail rows, so input reads like the rest. */
export const row = { ...detailRow, minWidth: 0 } as const;

/** A nested object or a list spans the row, its label above its content. */
export const group = { ...row, display: 'block' } as const;

export const label = { overflowWrap: 'break-word', fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary' } as const;

export const groupLabel = { display: 'block', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 } as const;

/** A multiline string has to show its line breaks, or two different values read as one. */
export const value = { minWidth: 0, fontSize: '0.8125rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap' } as const;

export const mono = { ...value, fontFamily: 'monospace' } as const;

export const badge = { height: 20, fontSize: '0.6875rem' } as const;
