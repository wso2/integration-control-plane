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

const TILE_SIZE = 72;

export const gridSx = { display: 'flex', flexWrap: 'wrap', gap: 6, rowGap: 2 } as const;

export const optionSx = {
  width: TILE_SIZE,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 1,
  p: 0,
  border: 0,
  bgcolor: 'transparent',
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
} as const;

export const tileSx = (selected: boolean) =>
  ({
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 1,
    bgcolor: 'common.white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    p: 1,
    boxShadow: selected ? 0 : 2,
    outline: selected ? 3 : 0,
    outlineColor: 'primary.main',
    outlineStyle: 'solid',
    transition: 'box-shadow 150ms',
  }) as const;

export const logoSx = { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' } as const;

export const captionSx = { whiteSpace: 'nowrap', textAlign: 'center' } as const;

export const errorSx = { display: 'block', mt: 1 } as const;
