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

import { describe, expect, it } from 'vitest';
import { expandedMenusFrom } from './sidebar';

describe('expandedMenusFrom', () => {
  it('opens any group id, including ones no nav entry names as a parent', () => {
    const menus = expandedMenusFrom(new Set());
    expect(menus['admin']).toBe(true);
    expect(menus['proj-observability']).toBe(true);
  });

  it('keeps the groups the user closed shut', () => {
    const menus = expandedMenusFrom(new Set(['admin']));
    expect(menus['admin']).toBe(false);
    expect(menus['operate']).toBe(true);
  });
});
