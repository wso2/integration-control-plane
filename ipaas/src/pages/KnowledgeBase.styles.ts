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

/** Styles shared by the knowledge base pages. */

export const toolbarSx = { mb: 3 } as const;

export const wizardLayoutSx = { mt: 3 } as const;

export const wizardStepperSx = { width: { xs: '100%', md: 240 }, flexShrink: 0, pt: 1 } as const;

export const wizardBodySx = { flex: 1, maxWidth: 900, mt: 2 } as const;

export const wizardActionsSx = { mt: 4 } as const;

export const summaryGridSx = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' }, rowGap: 1.5, columnGap: 2, alignItems: 'center' } as const;

export const sectionHeaderSx = { mb: 2 } as const;

export const tabsSx = { mb: 3, maxWidth: 640 } as const;

/** The Overview's settings: one column per setting, each marked by a bar on its left. */
export const overviewGridSx = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3 } as const;

export const overviewItemSx = { borderLeft: '3px solid', borderColor: 'primary.main', pl: 1.5, minWidth: 0 } as const;

export const dataSourceToolbarSx = { mb: 2 } as const;

export const searchFieldSx = { width: { xs: '100%', sm: 320 } } as const;
