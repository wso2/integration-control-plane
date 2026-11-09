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

/** The definition row: the label beside its selector, as the card's endpoint row lays them out, and the action at its far end. */
export const definitionRow = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 3, rowGap: 1, mb: 2 } as const;

export const definitionPicker = { display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 } as const;

export const label = { fontWeight: 500, flexShrink: 0 } as const;

export const select = { width: 240, fontSize: '13px' } as const;

export const option = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' } as const;

export const optionName = { fontSize: '13px' } as const;

export const actions = { display: 'flex', gap: 1, ml: 'auto' } as const;

export const inactiveNote = { mt: -1, mb: 2 } as const;

/** Stands in for the content while it connects: the definition row, then the six figures. */
export const skeleton = { gap: 2 } as const;

export const skeletonRow = { display: 'flex', alignItems: 'center', gap: 1 } as const;

/** As high as a figure tile: a caption over an `h6` value, inside its padding and frame. */
export const TILE_HEIGHT = 70;
