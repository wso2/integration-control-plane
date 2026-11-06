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

/** Shared by the task and review detail views, their Administer card and their dialogs. */

/** The detail reads as a centred column, maximized or not. */
export const content = { maxWidth: 960, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 } as const;

/** The editor an action card opens, parted from the cards above it. */
export const editorPanel = { display: 'flex', flexDirection: 'column', gap: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' } as const;

export const formActions = { display: 'flex', justifyContent: 'flex-end', gap: 1 } as const;

export const chips = { display: 'flex', flexWrap: 'wrap', gap: 0.5 } as const;

export const durationFields = { display: 'flex', flexWrap: 'wrap', gap: 1.5 } as const;

export const durationField = { width: 120 } as const;

export const notOwnedHere = { color: 'text.secondary' } as const;

/** One changed argument in the review-changes step: its label, the value struck out, the new value. */
export const changeRow = { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 1 } as const;

export const changeLabel = { fontWeight: 600, minWidth: 140 } as const;

// pre-wrap: a multiline value has to show its line breaks, or two different values read as one.
export const changeFrom = { color: 'text.disabled', textDecoration: 'line-through', wordBreak: 'break-word', whiteSpace: 'pre-wrap' } as const;

export const changeTo = { color: 'success.main', wordBreak: 'break-word', whiteSpace: 'pre-wrap' } as const;

export const skeletonSection = { border: '1px solid', borderColor: 'divider', borderRadius: 1.25, p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 } as const;
