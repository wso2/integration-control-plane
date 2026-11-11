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

export const formSx = { maxWidth: 860 } as const;

export const targetCardSx = { p: 2.5 } as const;

export const modeGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
  gap: 2,
} as const;

export const modeCardSx = (selected: boolean) =>
  ({
    borderColor: selected ? 'primary.main' : 'divider',
    borderWidth: selected ? 2 : 1,
    height: '100%',
  }) as const;

export const modeActionSx = { p: 2, height: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 1.5 } as const;

export const ruleListSx = { m: 0, pl: 2.5 } as const;

export const nameRowSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
  gap: 2,
} as const;
